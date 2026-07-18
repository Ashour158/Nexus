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
  /** Stage probability (0-100) when the event carries it, else 0. */
  probability: number;
  /** Calibrated AI win-probability (0.0-1.0) when the event carries it, else null. */
  aiWinProbability: number | null;
  /** Deal stage token (stageName / stageId) for ForecastCategoryMap resolution. */
  stage: string;
  /** True for `deal.won` / `deal.lost` — a terminal category the map must not override. */
  terminal: boolean;
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
  // Prefer the deal's explicit forecast category when the event carries it —
  // it is the human/CRM-native categorization and is more accurate than
  // bucketing on probability alone.
  const explicit = String(payload.forecastCategory ?? '').toUpperCase();
  if (explicit === 'CLOSED') return 'won';
  if (explicit === 'OMITTED') return 'lost';
  if (explicit === 'COMMIT') return 'commit';
  if (explicit === 'BEST_CASE') return 'best_case';
  if (explicit === 'PIPELINE') return 'pipeline';
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
  const probRaw = Number(payload.probability);
  const probability = Number.isFinite(probRaw) ? Math.max(0, Math.min(100, probRaw)) : 0;
  const aiRaw = Number(payload.aiWinProbability);
  const aiWinProbability =
    Number.isFinite(aiRaw) && aiRaw >= 0 && aiRaw <= 1 ? aiRaw : null;
  const stage = String(
    payload.stageName ?? payload.newStageId ?? payload.stageId ?? payload.stage ?? ''
  );
  return {
    tenantId,
    dealId,
    ownerId,
    period: periodForEvent(payload, eventTimestamp),
    amount: toDecimal(payload.amount),
    currency: String(payload.currency ?? 'USD'),
    category: categoryForEvent(type, payload),
    probability,
    aiWinProbability,
    stage,
    terminal: type === 'deal.won' || type === 'deal.lost',
  };
}

/** Optional per-tenant stage → internal-category resolver (ForecastCategoryMap). */
export interface CategoryResolver {
  resolveInternal: (tenantId: string, stage: string) => Promise<ForecastCategory | null>;
}

export function createForecastRollupService(
  prisma: PlanningPrisma,
  opts: { categoryResolver?: CategoryResolver } = {}
) {
  const categoryResolver = opts.categoryResolver;
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
    let weighted = new Decimal(0);
    let aiWeighted = new Decimal(0);
    let openCount = 0;
    let wonCount = 0;
    for (const s of states) {
      const amt = new Decimal(s.amount.toString());
      const isOpen = s.category === 'commit' || s.category === 'best_case' || s.category === 'pipeline';
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
      if (isOpen) {
        // Probability-weighted open pipeline (stage probability, 0-100).
        const prob = new Decimal(s.probability ?? 0).div(100);
        weighted = weighted.plus(amt.mul(prob));
        // AI-adjusted open pipeline: use the per-deal AI win-probability when
        // present, else fall back to the stage probability (never invent).
        const ai = s.aiWinProbability != null ? new Decimal(s.aiWinProbability) : prob;
        aiWeighted = aiWeighted.plus(amt.mul(ai));
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
        weightedAmount: weighted.toFixed(2),
        aiWeightedAmount: aiWeighted.toFixed(2),
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
        weightedAmount: weighted.toFixed(2),
        aiWeightedAmount: aiWeighted.toFixed(2),
        closedWonAmount: won.toFixed(2),
        openDealCount: openCount,
        wonDealCount: wonCount,
      },
    });
  }

  const INTERNAL_TO_PUBLIC: Record<ForecastCategory, 'COMMIT' | 'BEST_CASE' | 'PIPELINE' | 'OMITTED' | 'CLOSED'> = {
    commit: 'COMMIT',
    best_case: 'BEST_CASE',
    pipeline: 'PIPELINE',
    lost: 'OMITTED',
    won: 'CLOSED',
  };

  /**
   * Per-category amount + count breakdown for a scope (one owner, a set of
   * subordinate owners, or the whole tenant when `ownerIds` is undefined),
   * computed directly from the per-deal DealForecastState rows so counts and the
   * OMITTED bucket are exact. All amounts are already in the tenant base currency
   * (converted at ingest time).
   */
  async function computeScopeForecast(
    tenantId: string,
    period: string,
    ownerIds?: string[]
  ): Promise<{
    forecast: {
      categories: Record<string, { amount: string; count: number }>;
      committedTotal: string;
      bestCaseTotal: string;
      pipelineTotal: string;
      weightedPipeline: string;
      aiWeightedPipeline: string;
      openDealCount: number;
      wonDealCount: number;
      ownerCount: number;
    };
    closedWon: Decimal;
  }> {
    const states = await prisma.dealForecastState.findMany({
      where: { tenantId, period, ...(ownerIds ? { ownerId: { in: ownerIds } } : {}) },
    });
    const cat: Record<'COMMIT' | 'BEST_CASE' | 'PIPELINE' | 'OMITTED' | 'CLOSED', { amount: Decimal; count: number }> = {
      COMMIT: { amount: new Decimal(0), count: 0 },
      BEST_CASE: { amount: new Decimal(0), count: 0 },
      PIPELINE: { amount: new Decimal(0), count: 0 },
      OMITTED: { amount: new Decimal(0), count: 0 },
      CLOSED: { amount: new Decimal(0), count: 0 },
    };
    let weighted = new Decimal(0);
    let aiWeighted = new Decimal(0);
    const owners = new Set<string>();
    for (const s of states) {
      owners.add(s.ownerId);
      const amt = new Decimal(s.amount.toString());
      const key = INTERNAL_TO_PUBLIC[s.category as ForecastCategory] ?? 'PIPELINE';
      cat[key].amount = cat[key].amount.plus(amt);
      cat[key].count += 1;
      const isOpen = s.category === 'commit' || s.category === 'best_case' || s.category === 'pipeline';
      if (isOpen) {
        const prob = new Decimal(s.probability ?? 0).div(100);
        weighted = weighted.plus(amt.mul(prob));
        const ai = s.aiWinProbability != null ? new Decimal(s.aiWinProbability) : prob;
        aiWeighted = aiWeighted.plus(amt.mul(ai));
      }
    }
    const commit = cat.COMMIT.amount;
    const best = cat.BEST_CASE.amount;
    const pipe = cat.PIPELINE.amount;
    return {
      forecast: {
        categories: {
          COMMIT: { amount: cat.COMMIT.amount.toFixed(2), count: cat.COMMIT.count },
          BEST_CASE: { amount: cat.BEST_CASE.amount.toFixed(2), count: cat.BEST_CASE.count },
          PIPELINE: { amount: cat.PIPELINE.amount.toFixed(2), count: cat.PIPELINE.count },
          OMITTED: { amount: cat.OMITTED.amount.toFixed(2), count: cat.OMITTED.count },
          CLOSED: { amount: cat.CLOSED.amount.toFixed(2), count: cat.CLOSED.count },
        },
        // commit ⊆ best_case ⊆ pipeline containment, matching the rest of the surface.
        committedTotal: commit.toFixed(2),
        bestCaseTotal: commit.plus(best).toFixed(2),
        pipelineTotal: commit.plus(best).plus(pipe).toFixed(2),
        weightedPipeline: weighted.toFixed(2),
        aiWeightedPipeline: aiWeighted.toFixed(2),
        openDealCount: cat.COMMIT.count + cat.BEST_CASE.count + cat.PIPELINE.count,
        wonDealCount: cat.CLOSED.count,
        ownerCount: owners.size,
      },
      closedWon: cat.CLOSED.amount,
    };
  }

  /** Resolve one owner's quota target for a period: new Quota model first, then legacy QuotaPlan/Target. */
  async function resolveOwnerQuota(
    tenantId: string,
    ownerId: string,
    period: string
  ): Promise<{ target: Decimal; currency: string; source: 'quota' | 'plan' | 'none' }> {
    const q = await prisma.quota.findFirst({
      where: { tenantId, ownerType: 'USER', ownerId, period },
    });
    if (q) return { target: new Decimal(q.targetAmount.toString()), currency: q.currency, source: 'quota' };
    const match = /^(\d{4})(?:-Q([1-4]))?$/.exec(period);
    const year = match ? Number(match[1]) : new Date().getUTCFullYear();
    const quarter = match && match[2] ? Number(match[2]) : undefined;
    const plan = await prisma.quotaPlan.findFirst({
      where: { tenantId, year, quarter: quarter ?? null, isActive: true, targets: { some: { ownerId } } },
      include: { targets: { where: { ownerId } } },
      orderBy: { createdAt: 'desc' },
    });
    const t = plan?.targets[0];
    if (t) return { target: new Decimal(t.targetValue.toString()), currency: t.currency, source: 'plan' };
    return { target: new Decimal(0), currency: 'USD', source: 'none' };
  }

  /** Sum quota targets over a set of owners for a period (used for manager/team roll-up). */
  async function sumQuotas(
    tenantId: string,
    ownerIds: string[],
    period: string
  ): Promise<{ target: Decimal; currency: string }> {
    let target = new Decimal(0);
    let currency = 'USD';
    for (const id of ownerIds) {
      const q = await resolveOwnerQuota(tenantId, id, period);
      target = target.plus(q.target);
      if (q.source !== 'none') currency = q.currency;
    }
    return { target, currency };
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

      // Resolve the forecast category. `deal.won`/`deal.lost` are terminal and
      // never re-mapped. For open deals, the tenant's ForecastCategoryMap (by
      // stage) is authoritative when configured; otherwise we keep the provisional
      // category (explicit deal forecastCategory / probability bucket).
      let category = evt.category;
      if (!evt.terminal && evt.stage && categoryResolver) {
        try {
          const mapped = await categoryResolver.resolveInternal(evt.tenantId, evt.stage);
          if (mapped) category = mapped;
        } catch {
          /* fail-open: keep provisional category */
        }
      }

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
          category,
          stage: evt.stage,
          probability: evt.probability,
          aiWinProbability: evt.aiWinProbability,
        },
        create: {
          tenantId: evt.tenantId,
          dealId: evt.dealId,
          ownerId: evt.ownerId,
          period: evt.period,
          amount: baseAmountStr,
          category,
          stage: evt.stage,
          probability: evt.probability,
          aiWinProbability: evt.aiWinProbability,
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
        weighted: new Decimal(r.weightedAmount.toString()).toFixed(2),
        aiWeighted: new Decimal(r.aiWeightedAmount.toString()).toFixed(2),
        closedWon: new Decimal(r.closedWonAmount.toString()).toFixed(2),
        openDealCount: r.openDealCount,
        wonDealCount: r.wonDealCount,
      }));
      const totals = owners.reduce(
        (acc, o) => ({
          commit: acc.commit.plus(o.commit),
          bestCase: acc.bestCase.plus(o.bestCase),
          pipeline: acc.pipeline.plus(o.pipeline),
          weighted: acc.weighted.plus(o.weighted),
          aiWeighted: acc.aiWeighted.plus(o.aiWeighted),
          closedWon: acc.closedWon.plus(o.closedWon),
        }),
        {
          commit: new Decimal(0),
          bestCase: new Decimal(0),
          pipeline: new Decimal(0),
          weighted: new Decimal(0),
          aiWeighted: new Decimal(0),
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
          weighted: totals.weighted.toFixed(2),
          aiWeighted: totals.aiWeighted.toFixed(2),
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
        gapToQuota: Decimal.max(quota.minus(closedWon), 0).toFixed(2),
        currency: target?.currency ?? 'USD',
        wonDealCount: agg?.wonDealCount ?? 0,
      };
    },

    /**
     * Consolidated forecast for a period: per-category amount + count, weighted /
     * AI-weighted pipeline, quota + attainment % (closed-won vs quota) for the
     * owner (or the whole team when `ownerId` is omitted), and an optional manager
     * roll-up summed over the manager's subtree (`subtreeOwnerIds`, self +
     * subordinates resolved from the org chart by the caller).
     *
     * Everything is tenant-scoped and expressed in the tenant base currency.
     */
    async getForecast(
      tenantId: string,
      period: string,
      ownerId?: string,
      subtreeOwnerIds?: string[]
    ) {
      const scopeIds = ownerId ? [ownerId] : undefined;
      const own = await computeScopeForecast(tenantId, period, scopeIds);

      // Quota + attainment for the primary scope.
      let quotaTarget: Decimal;
      let quotaCurrency: string;
      let quotaSource: 'quota' | 'plan' | 'none' | 'team';
      if (ownerId) {
        const q = await resolveOwnerQuota(tenantId, ownerId, period);
        quotaTarget = q.target;
        quotaCurrency = q.currency;
        quotaSource = q.source;
      } else {
        // Team-wide: sum every configured Quota (USER) for the period.
        const rows = await prisma.quota.findMany({
          where: { tenantId, ownerType: 'USER', period },
        });
        quotaTarget = rows.reduce((s, r) => s.plus(new Decimal(r.targetAmount.toString())), new Decimal(0));
        quotaCurrency = rows[0]?.currency ?? 'USD';
        quotaSource = 'team';
      }
      const closedWon = own.closedWon;
      const attainmentPct = quotaTarget.gt(0) ? closedWon.div(quotaTarget).mul(100) : new Decimal(0);

      // Manager roll-up over subordinates (only when a real subtree is present).
      let managerRollup: {
        ownerIds: string[];
        subordinateCount: number;
        forecast: Awaited<ReturnType<typeof computeScopeForecast>>['forecast'];
        quota: { target: string; currency: string };
        attainment: { closedWon: string; attainmentPct: string; gapToQuota: string };
      } | null = null;
      if (ownerId && subtreeOwnerIds && subtreeOwnerIds.length > 1) {
        const team = await computeScopeForecast(tenantId, period, subtreeOwnerIds);
        const teamQuota = await sumQuotas(tenantId, subtreeOwnerIds, period);
        const teamPct = teamQuota.target.gt(0)
          ? team.closedWon.div(teamQuota.target).mul(100)
          : new Decimal(0);
        managerRollup = {
          ownerIds: subtreeOwnerIds,
          subordinateCount: subtreeOwnerIds.length - 1,
          forecast: team.forecast,
          quota: { target: teamQuota.target.toFixed(2), currency: teamQuota.currency },
          attainment: {
            closedWon: team.closedWon.toFixed(2),
            attainmentPct: teamPct.toFixed(2),
            gapToQuota: Decimal.max(teamQuota.target.minus(team.closedWon), 0).toFixed(2),
          },
        };
      }

      return {
        period,
        ownerId: ownerId ?? null,
        scope: ownerId ? 'owner' : 'team',
        forecast: own.forecast,
        quota: { target: quotaTarget.toFixed(2), currency: quotaCurrency, source: quotaSource },
        attainment: {
          closedWon: closedWon.toFixed(2),
          attainmentPct: attainmentPct.toFixed(2),
          gapToQuota: Decimal.max(quotaTarget.minus(closedWon), 0).toFixed(2),
        },
        managerRollup,
      };
    },

    /**
     * Capture a point-in-time snapshot of every owner aggregate AND a team
     * (per-period) aggregate, for a given `asOf` day. Cross-tenant safe: the
     * poller runs with NO tenant ALS, so the tenant Prisma extension is a no-op
     * and explicit tenantId scoping in each row governs isolation.
     *
     * Idempotent: re-running for the same `asOf` upserts the same rows (unique on
     * tenant+scope+owner+period+asOf), so a retry never double-writes.
     */
    async snapshotAll(asOf: Date = new Date()): Promise<{ owners: number; teams: number }> {
      // Normalize to UTC midnight so at most one snapshot per day per key.
      const day = new Date(
        Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
      );
      const aggregates = await prisma.forecastAggregate.findMany({});
      // Accumulate team totals per (tenant, period).
      const teamTotals = new Map<
        string,
        {
          tenantId: string;
          period: string;
          commit: Decimal;
          bestCase: Decimal;
          pipeline: Decimal;
          weighted: Decimal;
          aiWeighted: Decimal;
          closedWon: Decimal;
          openDealCount: number;
          wonDealCount: number;
        }
      >();
      let ownerRows = 0;
      for (const a of aggregates) {
        const commit = new Decimal(a.commitAmount.toString());
        const bestCase = new Decimal(a.bestCaseAmount.toString());
        const pipeline = new Decimal(a.pipelineAmount.toString());
        const weighted = new Decimal(a.weightedAmount.toString());
        const aiWeighted = new Decimal(a.aiWeightedAmount.toString());
        const closedWon = new Decimal(a.closedWonAmount.toString());
        await prisma.forecastSnapshot.upsert({
          where: {
            tenantId_scope_ownerId_period_asOf: {
              tenantId: a.tenantId,
              scope: 'owner',
              ownerId: a.ownerId,
              period: a.period,
              asOf: day,
            },
          },
          update: {
            commitAmount: commit.toFixed(2),
            bestCaseAmount: bestCase.toFixed(2),
            pipelineAmount: pipeline.toFixed(2),
            weightedAmount: weighted.toFixed(2),
            aiWeightedAmount: aiWeighted.toFixed(2),
            closedWonAmount: closedWon.toFixed(2),
            openDealCount: a.openDealCount,
            wonDealCount: a.wonDealCount,
          },
          create: {
            tenantId: a.tenantId,
            scope: 'owner',
            ownerId: a.ownerId,
            period: a.period,
            asOf: day,
            commitAmount: commit.toFixed(2),
            bestCaseAmount: bestCase.toFixed(2),
            pipelineAmount: pipeline.toFixed(2),
            weightedAmount: weighted.toFixed(2),
            aiWeightedAmount: aiWeighted.toFixed(2),
            closedWonAmount: closedWon.toFixed(2),
            openDealCount: a.openDealCount,
            wonDealCount: a.wonDealCount,
          },
        });
        ownerRows += 1;

        const key = `${a.tenantId}::${a.period}`;
        const t =
          teamTotals.get(key) ??
          {
            tenantId: a.tenantId,
            period: a.period,
            commit: new Decimal(0),
            bestCase: new Decimal(0),
            pipeline: new Decimal(0),
            weighted: new Decimal(0),
            aiWeighted: new Decimal(0),
            closedWon: new Decimal(0),
            openDealCount: 0,
            wonDealCount: 0,
          };
        t.commit = t.commit.plus(commit);
        t.bestCase = t.bestCase.plus(bestCase);
        t.pipeline = t.pipeline.plus(pipeline);
        t.weighted = t.weighted.plus(weighted);
        t.aiWeighted = t.aiWeighted.plus(aiWeighted);
        t.closedWon = t.closedWon.plus(closedWon);
        t.openDealCount += a.openDealCount;
        t.wonDealCount += a.wonDealCount;
        teamTotals.set(key, t);
      }

      let teamRows = 0;
      for (const t of teamTotals.values()) {
        await prisma.forecastSnapshot.upsert({
          where: {
            tenantId_scope_ownerId_period_asOf: {
              tenantId: t.tenantId,
              scope: 'team',
              ownerId: '',
              period: t.period,
              asOf: day,
            },
          },
          update: {
            commitAmount: t.commit.toFixed(2),
            bestCaseAmount: t.bestCase.toFixed(2),
            pipelineAmount: t.pipeline.toFixed(2),
            weightedAmount: t.weighted.toFixed(2),
            aiWeightedAmount: t.aiWeighted.toFixed(2),
            closedWonAmount: t.closedWon.toFixed(2),
            openDealCount: t.openDealCount,
            wonDealCount: t.wonDealCount,
          },
          create: {
            tenantId: t.tenantId,
            scope: 'team',
            ownerId: '',
            period: t.period,
            asOf: day,
            commitAmount: t.commit.toFixed(2),
            bestCaseAmount: t.bestCase.toFixed(2),
            pipelineAmount: t.pipeline.toFixed(2),
            weightedAmount: t.weighted.toFixed(2),
            aiWeightedAmount: t.aiWeighted.toFixed(2),
            closedWonAmount: t.closedWon.toFixed(2),
            openDealCount: t.openDealCount,
            wonDealCount: t.wonDealCount,
          },
        });
        teamRows += 1;
      }
      return { owners: ownerRows, teams: teamRows };
    },

    /**
     * Forecast TREND for a period: the ordered series of point-in-time snapshots
     * so a caller can chart how commit / best-case / AI-weighted moved over the
     * quarter. `scope="team"` returns the whole-team series; `scope="owner"`
     * requires an ownerId.
     */
    async getTrend(
      tenantId: string,
      period: string,
      scope: 'owner' | 'team' = 'team',
      ownerId?: string
    ) {
      const rows = await prisma.forecastSnapshot.findMany({
        where: {
          tenantId,
          period,
          scope,
          ...(scope === 'owner' ? { ownerId: ownerId ?? '' } : { ownerId: '' }),
        },
        orderBy: { asOf: 'asc' },
      });
      return {
        period,
        scope,
        ownerId: scope === 'owner' ? ownerId ?? '' : null,
        points: rows.map((r) => ({
          asOf: r.asOf,
          commit: new Decimal(r.commitAmount.toString()).toFixed(2),
          bestCase: new Decimal(r.bestCaseAmount.toString()).toFixed(2),
          pipeline: new Decimal(r.pipelineAmount.toString()).toFixed(2),
          weighted: new Decimal(r.weightedAmount.toString()).toFixed(2),
          aiWeighted: new Decimal(r.aiWeightedAmount.toString()).toFixed(2),
          closedWon: new Decimal(r.closedWonAmount.toString()).toFixed(2),
          openDealCount: r.openDealCount,
          wonDealCount: r.wonDealCount,
        })),
      };
    },
  };
}

export type ForecastRollupService = ReturnType<typeof createForecastRollupService>;
