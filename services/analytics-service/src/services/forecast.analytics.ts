import type { ClickHouseClient } from '@clickhouse/client';
import { Decimal } from 'decimal.js';

interface DealEventRow {
  deal_id: string;
  amount: string | number | null;
  probability: string | number | null;
  event_type: string;
  owner_id: string;
  occurred_at: string;
  close_month?: string;
  forecast_category?: string | null;
}

/**
 * Open-pipeline forecast categories (spec B7). CLOSED is intentionally excluded
 * from the open-pipeline breakdown; deals whose latest category is CLOSED are
 * dropped. Empty/unknown categories (old events that predate the column) are
 * treated as PIPELINE so nothing silently disappears from the roll-up.
 */
export type ForecastCategory = 'COMMIT' | 'BEST_CASE' | 'PIPELINE';
const FORECAST_CATEGORIES: ForecastCategory[] = ['COMMIT', 'BEST_CASE', 'PIPELINE'];

export interface ForecastCategoryBreakdown {
  category: ForecastCategory;
  weighted: string;
  total: string;
  dealCount: number;
}

export interface ForecastData {
  weightedPipeline: string;
  totalPipeline: string;
  /** Percentage on the 0-100 scale. */
  winRatePct: number;
  /** Compatibility alias, also on the 0-100 scale. */
  winRate: number;
  forecastByMonth: Array<{
    month: string;
    weighted: string;
    total: string;
  }>;
  forecastByCategory: ForecastCategoryBreakdown[];
}

export function createForecastAnalyticsService(client: ClickHouseClient) {
  return {
    async getWeightedPipeline(tenantId: string): Promise<ForecastData> {
      // ── Real win rate first (won / (won + lost)) over the trailing window ──
      // Derived from the actual event stream so it can double as the per-deal
      // probability fallback below (instead of a silent flat 0.25). Only if the
      // tenant has NO closed deals in the window do we use a documented literal.
      const winRateResult = await client.query({
        query: `
          SELECT
            countIf(event_type = 'deal.won') AS won,
            countIf(event_type IN ('deal.won', 'deal.lost')) AS total
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= now() - INTERVAL 12 MONTH
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const [winRow] = await winRateResult.json<{ won: number; total: number }>();
      const hasWinRate = Boolean(winRow && winRow.total > 0);
      // Documented literal fallback used ONLY when win rate is genuinely not
      // derivable (no won/lost deals in the window). Never silently applied to a
      // tenant that has real close history.
      const FALLBACK_PROBABILITY = new Decimal(0.25);
      const winRate = hasWinRate
        ? new Decimal(winRow.won).div(winRow.total)
        : FALLBACK_PROBABILITY;

      // ── Open weighted pipeline ────────────────────────────────────────────
      // Resolve the LATEST state per deal across ALL event types (not just
      // deal.created), then keep only deals whose latest status is neither won
      // nor lost — i.e. genuinely open pipeline.
      //
      //  - amount:      last NON-ZERO amount (created/won/lost carry the real
      //                 amount; stage-change rows are stored as 0, so we skip
      //                 them via argMaxIf on `amount != 0`). Prefers the
      //                 base-currency amount, falling back to raw for old rows.
      //  - probability: last NON-ZERO per-stage probability (0-100). Rows that
      //                 don't carry it are stored as 0 and skipped.
      //  - status:      argMax(event_type) over the full stream. deal.won /
      //                 deal.lost are terminal; created / stage_changed /
      //                 reopened count as open.
      //
      // DATA GAP (documented): the deal event stream carries no expectedCloseDate
      // (no such column on deal_events and no publisher emits it), so open deals
      // CANNOT be bucketed by expected close month. We bucket by the deal's most
      // recent activity month as a transparent proxy; the headline weighted /
      // total pipeline figures below are unaffected by this and are correct.
      const res = await client.query({
        query: `
          SELECT
            deal_id,
            argMaxIf(if(base_amount != 0, base_amount, amount), occurred_at, amount != 0) AS amount,
            argMaxIf(probability, occurred_at, probability != 0) AS probability,
            argMax(owner_id, occurred_at) AS owner_id,
            argMaxIf(forecast_category, occurred_at, forecast_category != '') AS forecast_category,
            toStartOfMonth(max(occurred_at)) AS close_month
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
          GROUP BY deal_id
          HAVING argMax(event_type, occurred_at) NOT IN ('deal.won', 'deal.lost')
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const deals = await res.json<DealEventRow>();

      let weightedPipeline = new Decimal(0);
      let totalPipeline = new Decimal(0);
      const byMonth: Record<string, { weighted: Decimal; total: Decimal }> = {};
      // Weighted-pipeline broken down by forecast category (spec B7). Seeded with
      // all open categories so the response shape is stable even for empty buckets.
      const byCategory: Record<
        ForecastCategory,
        { weighted: Decimal; total: Decimal; dealCount: number }
      > = {
        COMMIT: { weighted: new Decimal(0), total: new Decimal(0), dealCount: 0 },
        BEST_CASE: { weighted: new Decimal(0), total: new Decimal(0), dealCount: 0 },
        PIPELINE: { weighted: new Decimal(0), total: new Decimal(0), dealCount: 0 },
      };

      for (const deal of deals) {
        const amount = new Decimal(deal.amount ?? 0);
        // probability is stored on the 0-100 scale (per-stage win probability).
        // Use it when present (> 0); otherwise fall back to the tenant's REAL
        // historical win rate (already a 0-1 fraction), NOT a hardcoded constant.
        const rawProbability = Number(deal.probability ?? 0);
        const probability =
          Number.isFinite(rawProbability) && rawProbability > 0
            ? new Decimal(rawProbability).div(100)
            : winRate;
        const weighted = amount.mul(probability);
        weightedPipeline = weightedPipeline.plus(weighted);
        totalPipeline = totalPipeline.plus(amount);
        const month = deal.close_month ?? 'unknown';
        byMonth[month] = byMonth[month] ?? {
          weighted: new Decimal(0),
          total: new Decimal(0),
        };
        byMonth[month].weighted = byMonth[month].weighted.plus(weighted);
        byMonth[month].total = byMonth[month].total.plus(amount);

        // ── Forecast-category breakdown ──────────────────────────────────────
        // Resolve the deal's LATEST forecast_category (argMaxIf already skipped
        // empty rows in SQL). Normalize: empty / unknown / legacy-PIPELINE → the
        // PIPELINE bucket so no open deal is silently dropped. An explicit CLOSED
        // on a still-open deal is a data inconsistency — excluded from the open
        // breakdown per spec (won/lost are already filtered out by status above).
        const rawCategory = String(deal.forecast_category ?? '').trim().toUpperCase();
        if (rawCategory !== 'CLOSED') {
          const category: ForecastCategory =
            rawCategory === 'COMMIT' || rawCategory === 'BEST_CASE'
              ? rawCategory
              : 'PIPELINE';
          byCategory[category].weighted = byCategory[category].weighted.plus(weighted);
          byCategory[category].total = byCategory[category].total.plus(amount);
          byCategory[category].dealCount += 1;
        }
      }

      return {
        weightedPipeline: weightedPipeline.toFixed(2),
        totalPipeline: totalPipeline.toFixed(2),
        winRatePct: Number(winRate.mul(100).toFixed(2)),
        winRate: Number(winRate.mul(100).toFixed(2)),
        forecastByMonth: Object.entries(byMonth)
          .map(([month, values]) => ({
            month,
            weighted: values.weighted.toFixed(2),
            total: values.total.toFixed(2),
          }))
          .sort((a, b) => a.month.localeCompare(b.month)),
        forecastByCategory: FORECAST_CATEGORIES.map((category) => ({
          category,
          weighted: byCategory[category].weighted.toFixed(2),
          total: byCategory[category].total.toFixed(2),
          dealCount: byCategory[category].dealCount,
        })),
      };
    },
  };
}
