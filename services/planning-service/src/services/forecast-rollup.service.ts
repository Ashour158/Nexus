import { Decimal } from 'decimal.js';
import type { PlanningPrisma } from '../prisma.js';
import { ratesService } from '../lib/currency.js';

/**
 * Event-driven forecast roll-up.
 *
 * Consumes deal lifecycle events (`deal.created` / `deal.updated` /
 * `deal.stage_changed` / `deal.won` / `deal.lost`) and maintains, per
 * owner + period, a {@link ForecastAggregate}. The aggregate is derived state:
 * every deal's current contribution is stored in {@link DealForecastState}, and
 * the owner aggregate is recomputed as the SUM over those rows. This makes the
 * whole pipeline idempotent and safe under restart / replay — re-applying the
 * same event simply re-writes the same deal row and recomputes the same totals.
 *
 * All methods are guarded by the caller (try/catch + warn); nothing here is
 * allowed to crash the consumer loop.
 */

export type ForecastCategory = 'commit' | 'best_case' | 'pipeline' | 'won' | 'lost';

interface NormalizedDealEvent {
  tenantId: string;
  dealId: string;
  ownerId: string;
  period: string;
  /** Native deal amount, in `currency`. Converted to base at aggregate time. */
  amount: Decimal;
  /** Raw per-deal currency code, e.g. "EUR". Defaults to "USD" when absent. */
  currency: string;
  category: ForecastCategory;
}

/**
 * Maps an incoming deal event to a single forecast category.
 *
 * - `deal.won`  → `won`  (feeds realized closed-won attainment)
 * - `deal.lost` → `lost` (removed from every open bucket)
 * - open deals (`deal.created` / `deal.updated` / `deal.stage_changed`) are
 *   bucketed by `probability` when the payload carries it, else `pipeline`:
 *     probability >= 80 → commit
 *     probability >= 40 → best_case
 *     otherwise         → pipeline
 */
export function categoryForEvent(
  type: string | undefined,
  payload: Record<string, unknown>
): ForecastCategory {
  if (type === 'deal.won') return 'won';
  if (type === 'deal.lost') return 'lost';
  const explicit = String(payload.forecastCategory ?? '').toUpperCase();
  if (explicit === 'CLOSED') return 'won';
  if (explicit === 'OMITTED') return 'lost';
  const probRaw = payload.probability;
  const prob = typeof probRaw === 'number' ? probRaw : Number(probRaw);
  if (Number.isFinite(prob)) {
    if (prob >= 80) return 'commit';
    if (prob >= 40) return 'best_case';
  }
  return 'pipeline';
}

/**
 * Derives a period key (`YYYY-QN`) from a close date when present, else the
 * event time / now. Kept deterministic so replays land in the same bucket.
 */
export function periodForEvent(payload: Record<string, unknown>, eventTimestamp?: string): string {
  const raw =
    payload.expectedCloseDate ??
    payload.closeDate ??
    payload.actualCloseDate ??
    eventTimestamp ??
    undefined;
  const d = raw ? new Date(String(raw)) : new Date();
  const date = Number.isNaN(d.getTime()) ? new Date() : d;
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function toDecimal(value: unknown): Decimal {
  try {
    return new Decimal((value as string | number) ?? 0);
  } catch {
    return new Decimal(0);
  }
}

export function normalizeDealEvent(
  type: string | undefined,
  tenantId: string | undefined,
  payload: Record<string, unknown>,
  eventTimestamp?: string
): NormalizedDealEvent | null {
  const dealId = String(payload.dealId ?? payload.id ?? '');
  const ownerId = String(payload.ownerId ?? '');
  if (!tenantId || !dealId || !ownerId) return null;
  return {
    tenantId,
    dealId,
    ownerId,
    period: periodForEvent(payload, eventTimestamp),
    amount: toDecimal(payload.amount),
    currency: String(payload.currency ?? 'USD'),
    category: categoryForEvent(type, payload),
  };
}

export function createForecastRollupService(prisma: PlanningPrisma) {
  /**
   * Recompute and upsert the ForecastAggregate for one owner+period from the
   * current DealForecastState rows. Called after every deal-state write so the
   * aggregate always reflects committed deal state (restart-safe).
   */
  async function recomputeAggregate(
    tenantId: string,
    ownerId: string,
    period: string
  ): Promise<void> {
    const states = await prisma.dealForecastState.findMany({
      where: { tenantId, ownerId, period },
    });
    let commit = new Decimal(0);
    let best = new Decimal(0);
    let pipeline = new Decimal(0);
    let won = new Decimal(0);
    let openCount = 0;
    let wonCount = 0;
    for (const s of states) {
      const amt = new Decimal(s.amount.toString());
      switch (s.category) {
        case 'commit':
          commit = commit.plus(amt);
          openCount += 1;
          break;
        case 'best_case':
          best = best.plus(amt);
          openCount += 1;
          break;
        case 'pipeline':
          pipeline = pipeline.plus(amt);
          openCount += 1;
          break;
        case 'won':
          won = won.plus(amt);
          wonCount += 1;
          break;
        case 'lost':
        default:
          break;
      }
    }
    // Commit ⊆ best-case ⊆ pipeline: higher-confidence amounts roll up.
    const bestCaseTotal = commit.plus(best);
    const pipelineTotal = commit.plus(best).plus(pipeline);

    await prisma.forecastAggregate.upsert({
      where: { tenantId_ownerId_period: { tenantId, ownerId, period } },
      update: {
        commitAmount: commit.toFixed(2),
        bestCaseAmount: bestCaseTotal.toFixed(2),
        pipelineAmount: pipelineTotal.toFixed(2),
        closedWonAmount: won.toFixed(2),
        openDealCount: openCount,
        wonDealCount: wonCount,
      },
      create: {
        tenantId,
        ownerId,
        period,
        commitAmount: commit.toFixed(2),
        bestCaseAmount: bestCaseTotal.toFixed(2),
        pipelineAmount: pipelineTotal.toFixed(2),
        closedWonAmount: won.toFixed(2),
        openDealCount: openCount,
        wonDealCount: wonCount,
      },
    });
  }

  return {
    recomputeAggregate,

    /**
     * Apply a single normalized deal event. Idempotent: writes the deal's
     * current forecast state (upsert on tenantId+dealId), then recomputes the
     * owner aggregate for the affected period(s). If the deal moved period or
     * owner, the previously-affected aggregate is recomputed too so stale
     * amounts do not linger.
     */
    async apply(evt: NormalizedDealEvent): Promise<void> {
      const prev = await prisma.dealForecastState.findFirst({
        where: { tenantId: evt.tenantId, dealId: evt.dealId },
      });

      // Convert the native amount into the tenant base currency BEFORE storing,
      // so DealForecastState (and every aggregate summed from it) is expressed
      // in a single consistent currency. Fully guarded/fail-open: on any rates
      // failure convertToBase returns the native amount, so a rates hiccup never
      // breaks the consumer.
      const { baseAmount } = await ratesService.convertToBase(
        evt.tenantId,
        evt.amount.toNumber(),
        evt.currency
      );
      const baseAmountStr = new Decimal(
        Number.isFinite(baseAmount) ? baseAmount : evt.amount.toNumber()
      ).toFixed(2);

      await prisma.dealForecastState.upsert({
        where: { tenantId_dealId: { tenantId: evt.tenantId, dealId: evt.dealId } },
        update: {
          ownerId: evt.ownerId,
          period: evt.period,
          amount: baseAmountStr,
          category: evt.category,
        },
        create: {
          tenantId: evt.tenantId,
          dealId: evt.dealId,
          ownerId: evt.ownerId,
          period: evt.period,
          amount: baseAmountStr,
          category: evt.category,
        },
      });

      await recomputeAggregate(evt.tenantId, evt.ownerId, evt.period);
      if (prev && (prev.ownerId !== evt.ownerId || prev.period !== evt.period)) {
        await recomputeAggregate(evt.tenantId, prev.ownerId, prev.period);
      }
    },

    /** Per-owner + team roll-up for a period, from live deal-event state. */
    async getRollup(tenantId: string, period: string) {
      const rows = await prisma.forecastAggregate.findMany({
        where: { tenantId, period },
        orderBy: { ownerId: 'asc' },
      });
      const owners = rows.map((r) => ({
        ownerId: r.ownerId,
        commit: new Decimal(r.commitAmount.toString()).toFixed(2),
        bestCase: new Decimal(r.bestCaseAmount.toString()).toFixed(2),
        pipeline: new Decimal(r.pipelineAmount.toString()).toFixed(2),
        closedWon: new Decimal(r.closedWonAmount.toString()).toFixed(2),
        openDealCount: r.openDealCount,
        wonDealCount: r.wonDealCount,
      }));
      const totals = owners.reduce(
        (acc, o) => ({
          commit: acc.commit.plus(o.commit),
          bestCase: acc.bestCase.plus(o.bestCase),
          pipeline: acc.pipeline.plus(o.pipeline),
          closedWon: acc.closedWon.plus(o.closedWon),
        }),
        {
          commit: new Decimal(0),
          bestCase: new Decimal(0),
          pipeline: new Decimal(0),
          closedWon: new Decimal(0),
        }
      );
      return {
        period,
        owners,
        teamTotal: {
          commit: totals.commit.toFixed(2),
          bestCase: totals.bestCase.toFixed(2),
          pipeline: totals.pipeline.toFixed(2),
          closedWon: totals.closedWon.toFixed(2),
        },
      };
    },

    /**
     * Quota attainment for an owner+period, self-contained: closed-won from the
     * event-driven aggregate vs. the owner's QuotaTarget for that period.
     */
    async getAttainment(tenantId: string, ownerId: string, period: string) {
      const agg = await prisma.forecastAggregate.findFirst({
        where: { tenantId, ownerId, period },
      });
      const closedWon = new Decimal(agg?.closedWonAmount?.toString() ?? 0);

      // Match the QuotaTarget for this owner via the period's year (and quarter
      // when the period is quarterly, e.g. "2026-Q2").
      const match = /^(\d{4})(?:-Q([1-4]))?$/.exec(period);
      const year = match ? Number(match[1]) : new Date().getUTCFullYear();
      const quarter = match && match[2] ? Number(match[2]) : undefined;
      const plan = await prisma.quotaPlan.findFirst({
        where: {
          tenantId,
          year,
          quarter: quarter ?? null,
          isActive: true,
          targets: { some: { ownerId } },
        },
        include: { targets: { where: { ownerId } } },
        orderBy: { createdAt: 'desc' },
      });
      const target = plan?.targets[0];
      const quota = new Decimal(target?.targetValue?.toString() ?? 0);
      const attainmentPct = quota.gt(0) ? closedWon.div(quota).mul(100) : new Decimal(0);
      return {
        ownerId,
        period,
        quota: quota.toFixed(2),
        closedWon: closedWon.toFixed(2),
        attainmentPct: attainmentPct.toFixed(2),
        currency: target?.currency ?? 'USD',
        wonDealCount: agg?.wonDealCount ?? 0,
      };
    },
  };
}

export type ForecastRollupService = ReturnType<typeof createForecastRollupService>;
