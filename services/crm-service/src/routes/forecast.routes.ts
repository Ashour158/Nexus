import type { FastifyInstance } from 'fastify';
import type { CrmPrisma } from '../prisma.js';
import { ratesService } from '../lib/currency.js';
import {
  type ForecastDeal,
  type RepForecastRow,
  emptyBuckets,
  foldDeal,
  finalizeRep,
  fetchOrgChart,
  type OrgNode,
} from '../lib/forecast-rollup.service.js';

/**
 * Convert a raw deal amount into the tenant base currency. Fully guarded and
 * fail-open: on any rates failure `ratesService.convertToBase` returns the
 * native amount, so a rates hiccup never breaks a forecast endpoint.
 */
async function toBaseAmount(
  tenantId: string,
  amount: unknown,
  currency: unknown
): Promise<number> {
  const amt = Number(amount ?? 0);
  const { baseAmount } = await ratesService.convertToBase(
    tenantId,
    Number.isFinite(amt) ? amt : 0,
    String(currency ?? 'USD')
  );
  return baseAmount;
}

function getPeriodDates(period: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === 'this_month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3);
    start.setMonth(q * 3, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(q * 3 + 3, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'next_quarter') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    start.setMonth(q * 3, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(q * 3 + 3, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

/** Accepts shorthand like `this_quarter` or quarter keys `Q2-2026`. */
export function resolveForecastWindow(periodKey: string): { start: Date; end: Date } {
  // Normalize `YYYY-Qn` (quota period convention) → `Qn-YYYY`.
  const alt = /^(\d{4})-Q([1-4])$/.exec(periodKey.trim());
  const trimmed = alt ? `Q${alt[2]}-${alt[1]}` : periodKey.trim();
  const qr = /^Q([1-4])-(\d{4})$/.exec(trimmed);
  if (qr) {
    const qi = parseInt(qr[1], 10) - 1;
    const year = parseInt(qr[2], 10);
    const start = new Date(Date.UTC(year, qi * 3, 1));
    const end = new Date(Date.UTC(year, qi * 3 + 3, 0, 23, 59, 59, 999));
    return { start, end };
  }
  return getPeriodDates(trimmed);
}

/** Load window deals + a base-currency amount map, and fold into per-owner rows. */
async function computeRepRows(
  prisma: CrmPrisma,
  tenantId: string,
  start: Date,
  end: Date
): Promise<{ rows: RepForecastRow[]; rowsById: Map<string, RepForecastRow> }> {
  // Open (+DORMANT) pipeline bucketed on EXPECTED close date (never last-activity),
  // PLUS closed-won realized in the window (on ACTUAL close date) for attainment.
  const [openDeals, wonDeals] = await Promise.all([
    prisma.deal.findMany({
      where: { tenantId, status: { in: ['OPEN', 'DORMANT'] }, expectedCloseDate: { gte: start, lte: end } },
      include: { stage: true },
    }),
    prisma.deal.findMany({
      where: { tenantId, status: 'WON', actualCloseDate: { gte: start, lte: end } },
      include: { stage: true },
    }),
  ]);
  const deals = [...openDeals, ...wonDeals];

  const baseAmountByDeal = new Map<string, number>();
  await Promise.all(
    deals.map(async (d) => {
      baseAmountByDeal.set(d.id, await toBaseAmount(tenantId, d.amount, d.currency));
    })
  );

  const bucketsByOwner = new Map<string, ReturnType<typeof emptyBuckets>>();
  for (const deal of deals) {
    const b = bucketsByOwner.get(deal.ownerId) ?? emptyBuckets();
    foldDeal(b, deal as unknown as ForecastDeal, baseAmountByDeal.get(deal.id) ?? 0);
    bucketsByOwner.set(deal.ownerId, b);
  }

  const ownerIds = [...bucketsByOwner.keys()];
  const profiles = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const profileMap = new Map(profiles.map((u) => [u.id, u]));

  const rows = ownerIds.map((ownerId) => {
    const profile = profileMap.get(ownerId);
    const ownerName =
      profile && `${profile.firstName}${profile.lastName}`.trim()
        ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
        : ownerId.slice(0, 8);
    return finalizeRep(ownerId, ownerName, bucketsByOwner.get(ownerId)!);
  });
  rows.sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  return { rows, rowsById: new Map(rows.map((r) => [r.ownerId, r])) };
}

export async function registerForecastRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(async (r) => {
    // Per-rep forecast: commit/best_case/pipeline/omitted/closed + weighted +
    // AI-weighted, bucketed by the deal's forecastCategory on EXPECTED close date.
    r.get('/forecast/rep-summary', async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string };
      const tenantId = jwt.tenantId;
      if (!tenantId)
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { periodKey = 'this_quarter' } = req.query as { periodKey?: string };
      const { start, end } = resolveForecastWindow(periodKey);
      const { rows } = await computeRepRows(prisma, tenantId, start, end);
      return reply.send({ success: true, data: rows });
    });

    // Tenant-wide forecast summary: category buckets + weighted + AI-weighted +
    // realized closed-won, plus per-stage breakdown. Labels are precise —
    // `committed` is forecastCategory=COMMIT (not a probability≥80 proxy).
    r.get('/forecast', async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string };
      const tenantId = jwt.tenantId;
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { period = 'this_quarter' } = req.query as { period?: string };
      const { start, end } = getPeriodDates(period);

      const openDeals = await prisma.deal.findMany({
        where: { tenantId, status: { in: ['OPEN', 'DORMANT'] }, expectedCloseDate: { gte: start, lte: end } },
        include: { stage: true },
      });
      const baseAmountByDeal = new Map<string, number>();
      await Promise.all(
        openDeals.map(async (d) => {
          baseAmountByDeal.set(d.id, await toBaseAmount(tenantId, d.amount, d.currency));
        })
      );

      // Category buckets (commit ⊆ best_case ⊆ pipeline) + weighted/AI over open.
      const agg = emptyBuckets();
      const stageMap = new Map<string, { stageName: string; probability: number | null; totalAmount: number; dealCount: number }>();
      for (const deal of openDeals) {
        const amt = baseAmountByDeal.get(deal.id) ?? 0;
        foldDeal(agg, deal as unknown as ForecastDeal, amt);
        const stageId = deal.stageId || 'unknown';
        const stageName = deal.stage?.name || 'Unknown';
        // No invented default: probability is null when neither stage nor deal
        // carries one, and null stages are excluded from the weighted total.
        const probability = deal.stage?.probability ?? deal.probability ?? null;
        const entry = stageMap.get(stageId) ?? { stageName, probability, totalAmount: 0, dealCount: 0 };
        entry.totalAmount += amt;
        entry.dealCount += 1;
        stageMap.set(stageId, entry);
      }

      const stages = Array.from(stageMap.entries())
        .map(([stageId, s]) => ({
          stageId,
          stageName: s.stageName,
          // Numeric for the UI; 0 means "no probability configured" (honest —
          // NOT an invented default), so the stage simply carries no weight.
          probability: s.probability ?? 0,
          dealCount: s.dealCount,
          totalAmount: s.totalAmount,
          weightedAmount: s.probability == null ? 0 : Math.round(s.totalAmount * (s.probability / 100)),
        }))
        .sort((a, b) => (a.probability ?? 0) - (b.probability ?? 0));

      const closedDeals = await prisma.deal.findMany({
        where: { tenantId, status: 'WON', actualCloseDate: { gte: start, lte: end } },
        select: { amount: true, currency: true },
      });
      const closedBaseAmounts = await Promise.all(
        closedDeals.map((d) => toBaseAmount(tenantId, d.amount, d.currency))
      );
      const closed = closedBaseAmounts.reduce((s, a) => s + a, 0);

      const committed = agg.commit;
      const bestCase = agg.commit + agg.bestCase;
      const pipeline = agg.commit + agg.bestCase + agg.pipeline;
      const weighted = Math.round(agg.weighted);
      const aiWeighted = Math.round(agg.aiWeighted);

      return reply.send({
        success: true,
        data: {
          pipeline,
          weighted,
          aiWeighted,
          committed,
          bestCase,
          omitted: agg.omitted,
          closed,
          openDealCount: agg.openDealCount,
          aiScoredCount: agg.aiScoredCount,
          stages,
        },
      });
    });

    // Manager/org-hierarchy roll-up: rep → manager → VP tree with per-node own +
    // rolled-up forecast (commit/best_case/pipeline/weighted/aiWeighted). Falls
    // back to a flat single-level tree when the org chart is unavailable.
    r.get('/forecast/hierarchy', async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string };
      const tenantId = jwt.tenantId;
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { periodKey = 'this_quarter' } = req.query as { periodKey?: string };
      const { start, end } = resolveForecastWindow(periodKey);
      const { rowsById } = await computeRepRows(prisma, tenantId, start, end);

      const roots = await fetchOrgChart((req.headers as any).authorization, tenantId);

      interface Meta { name: string; jobTitle: string | null; managerId: string | null }
      const meta = new Map<string, Meta>();
      const order: string[] = [];
      const walk = (n: OrgNode, managerId: string | null): void => {
        if (!n?.userId) return;
        if (!meta.has(n.userId)) {
          meta.set(n.userId, { name: n.name ?? n.userId.slice(0, 8), jobTitle: n.jobTitle ?? null, managerId });
          order.push(n.userId);
        }
        for (const c of n.directReports ?? []) walk(c, n.userId);
      };
      for (const rt of roots) walk(rt, null);

      // Ensure every rep with deals is present even if absent from the org chart.
      for (const id of rowsById.keys()) {
        if (!meta.has(id)) {
          meta.set(id, { name: rowsById.get(id)!.ownerName, jobTitle: null, managerId: null });
          order.push(id);
        }
      }

      const childrenOf = new Map<string, string[]>();
      const rootIds: string[] = [];
      for (const id of order) {
        const m = meta.get(id)!.managerId;
        if (m && meta.has(m)) {
          const arr = childrenOf.get(m) ?? [];
          arr.push(id);
          childrenOf.set(m, arr);
        } else {
          rootIds.push(id);
        }
      }

      interface Node {
        userId: string;
        name: string;
        jobTitle: string | null;
        own: { commit: number; bestCase: number; pipeline: number; weighted: number; aiWeighted: number; closed: number };
        rolledUp: { commit: number; bestCase: number; pipeline: number; weighted: number; aiWeighted: number; closed: number; repCount: number };
        directReports: Node[];
      }
      const seen = new Set<string>();
      const build = (id: string): Node => {
        seen.add(id);
        const m = meta.get(id)!;
        const rep = rowsById.get(id);
        const own = {
          commit: rep?.commitTotal ?? 0,
          bestCase: rep?.bestCaseTotal ?? 0,
          pipeline: rep?.pipelineTotal ?? 0,
          weighted: rep?.weighted ?? 0,
          aiWeighted: rep?.aiWeighted ?? 0,
          closed: rep?.closed ?? 0,
        };
        const children = (childrenOf.get(id) ?? []).filter((c) => !seen.has(c)).map(build);
        const rolledUp = { ...own, repCount: rep ? 1 : 0 };
        for (const c of children) {
          rolledUp.commit += c.rolledUp.commit;
          rolledUp.bestCase += c.rolledUp.bestCase;
          rolledUp.pipeline += c.rolledUp.pipeline;
          rolledUp.weighted += c.rolledUp.weighted;
          rolledUp.aiWeighted += c.rolledUp.aiWeighted;
          rolledUp.closed += c.rolledUp.closed;
          rolledUp.repCount += c.rolledUp.repCount;
        }
        return { userId: id, name: m.name, jobTitle: m.jobTitle, own, rolledUp, directReports: children };
      };
      const tree = rootIds.filter((id) => !seen.has(id)).map(build);

      return reply.send({
        success: true,
        data: { period: periodKey, orgChartAvailable: roots.length > 0, tree },
      });
    });

    // What-if / scenario: given deals to WIN (force to closed-won) and deals to
    // SLIP (push out of the period), recompute commit/weighted/AI-weighted.
    r.post('/forecast/whatif', async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string };
      const tenantId = jwt.tenantId;
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const body = (req.body ?? {}) as { periodKey?: string; winDealIds?: string[]; slipDealIds?: string[] };
      const periodKey = body.periodKey ?? 'this_quarter';
      const winSet = new Set((body.winDealIds ?? []).filter((x) => typeof x === 'string'));
      const slipSet = new Set((body.slipDealIds ?? []).filter((x) => typeof x === 'string'));
      const { start, end } = resolveForecastWindow(periodKey);

      const openDeals = await prisma.deal.findMany({
        where: { tenantId, status: { in: ['OPEN', 'DORMANT'] }, expectedCloseDate: { gte: start, lte: end } },
        include: { stage: true },
      });
      const baseAmountByDeal = new Map<string, number>();
      await Promise.all(
        openDeals.map(async (d) => {
          baseAmountByDeal.set(d.id, await toBaseAmount(tenantId, d.amount, d.currency));
        })
      );

      const base = emptyBuckets();
      const scenario = emptyBuckets();
      // Only ids that actually matched an in-window open deal contribute — echoing
      // back non-existent / out-of-window / already-closed ids would be misleading.
      const appliedWin = new Set<string>();
      const appliedSlip = new Set<string>();
      for (const deal of openDeals) {
        const amt = baseAmountByDeal.get(deal.id) ?? 0;
        const d = deal as unknown as ForecastDeal;
        foldDeal(base, d, amt);
        if (slipSet.has(deal.id)) {
          appliedSlip.add(deal.id); // slipped out of the period entirely
          continue;
        }
        if (winSet.has(deal.id)) {
          appliedWin.add(deal.id);
          foldDeal(scenario, { ...d, status: 'WON' }, amt); // force-win → closed
        } else {
          foldDeal(scenario, d, amt);
        }
      }

      const view = (b: ReturnType<typeof emptyBuckets>) => ({
        commit: b.commit,
        bestCase: b.commit + b.bestCase,
        pipeline: b.commit + b.bestCase + b.pipeline,
        weighted: Math.round(b.weighted),
        aiWeighted: Math.round(b.aiWeighted),
        closed: b.closed,
      });
      const baseView = view(base);
      const scenarioView = view(scenario);
      return reply.send({
        success: true,
        data: {
          period: periodKey,
          applied: { win: [...appliedWin], slip: [...appliedSlip] },
          base: baseView,
          scenario: scenarioView,
          delta: {
            commit: scenarioView.commit - baseView.commit,
            weighted: scenarioView.weighted - baseView.weighted,
            aiWeighted: scenarioView.aiWeighted - baseView.aiWeighted,
            closed: scenarioView.closed - baseView.closed,
          },
        },
      });
    });

    // Quota attainment: realized closed-won vs quota target per rep, for a
    // period, with open-pipeline forecast-category coverage (commit/best_case/
    // pipeline) so leadership sees gap-to-quota. `period` is both the quota
    // lookup key and the forecast window (accepts `2026-Q3`, `Q3-2026`, or
    // shorthand like `this_quarter`).
    r.get('/forecast/attainment', async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string };
      const tenantId = jwt.tenantId;
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { period = 'this_quarter', userId } = req.query as { period?: string; userId?: string };
      const { start, end } = resolveForecastWindow(period);
      const { rowsById } = await computeRepRows(prisma, tenantId, start, end);

      const quotaWhere: { tenantId: string; period: string; userId?: string } = { tenantId, period };
      if (userId) quotaWhere.userId = userId;
      const quotas = await prisma.quota.findMany({ where: quotaWhere });

      const attainment = quotas.map((quota) => {
        const target = Number(quota.target);
        const rep = quota.userId ? rowsById.get(quota.userId) : undefined;
        const actual = rep?.closed ?? 0;
        const commit = rep?.commitTotal ?? 0;
        const bestCase = rep?.bestCaseTotal ?? 0;
        const pipeline = rep?.pipelineTotal ?? 0;
        return {
          quotaId: quota.id,
          userId: quota.userId,
          teamId: quota.teamId,
          territoryId: quota.territoryId,
          period: quota.period,
          currency: quota.currency,
          target,
          actual,
          attainmentPct: target > 0 ? Math.round((actual / target) * 10000) / 100 : null,
          gap: Math.round((target - actual) * 100) / 100,
          coverage: { commit, bestCase, pipeline },
          projectedAttainmentPct: target > 0 ? Math.round(((actual + commit) / target) * 10000) / 100 : null,
        };
      });

      const totals = attainment.reduce(
        (acc, a) => {
          acc.target += a.target;
          acc.actual += a.actual;
          return acc;
        },
        { target: 0, actual: 0 }
      );

      return reply.send({
        success: true,
        data: {
          period,
          quotas: attainment,
          totals: {
            ...totals,
            attainmentPct: totals.target > 0 ? Math.round((totals.actual / totals.target) * 10000) / 100 : null,
          },
        },
      });
    });
  }, { prefix: '/api/v1' });
}
