import type { ClickHouseClient } from '@clickhouse/client';
import { Decimal } from 'decimal.js';

interface DealEventRow {
  deal_id: string;
  amount: string | number | null;
  event_type: string;
  owner_id: string;
  occurred_at: string;
  close_month?: string;
}

export interface ForecastData {
  weightedPipeline: string;
  totalPipeline: string;
  winRate: string;
  forecastByMonth: Array<{
    month: string;
    weighted: string;
    total: string;
  }>;
}

export function createForecastAnalyticsService(client: ClickHouseClient) {
  return {
    async getWeightedPipeline(tenantId: string): Promise<ForecastData> {
      // Get latest open deal events using argMax to deduplicate by deal_id
      const res = await client.query({
        query: `
          SELECT
            deal_id,
            argMax(amount, occurred_at) AS amount,
            argMax(owner_id, occurred_at) AS owner_id,
            toStartOfMonth(argMax(occurred_at, occurred_at)) AS close_month
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND event_type = 'deal.created'
          GROUP BY deal_id
          HAVING argMax(event_type, occurred_at) != 'deal.lost'
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const deals = await res.json<DealEventRow>();

      let weightedPipeline = new Decimal(0);
      let totalPipeline = new Decimal(0);
      const byMonth: Record<string, { weighted: Decimal; total: Decimal }> = {};

      // Default probability of 25% for forecasting when stage data is unavailable
      const defaultProbability = new Decimal(0.25);

      for (const deal of deals) {
        const amount = new Decimal(deal.amount ?? 0);
        const weighted = amount.mul(defaultProbability);
        weightedPipeline = weightedPipeline.plus(weighted);
        totalPipeline = totalPipeline.plus(amount);
        const month = deal.close_month ?? 'unknown';
        byMonth[month] = byMonth[month] ?? {
          weighted: new Decimal(0),
          total: new Decimal(0),
        };
        byMonth[month].weighted = byMonth[month].weighted.plus(weighted);
        byMonth[month].total = byMonth[month].total.plus(amount);
      }

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
      const winRate =
        winRow && winRow.total > 0
          ? new Decimal(winRow.won).div(winRow.total)
          : new Decimal(0.25);

      return {
        weightedPipeline: weightedPipeline.toFixed(2),
        totalPipeline: totalPipeline.toFixed(2),
        winRate: winRate.toFixed(4),
        forecastByMonth: Object.entries(byMonth)
          .map(([month, values]) => ({
            month,
            weighted: values.weighted.toFixed(2),
            total: values.total.toFixed(2),
          }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      };
    },
  };
}
