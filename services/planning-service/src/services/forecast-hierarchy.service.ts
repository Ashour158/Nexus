import { Decimal } from 'decimal.js';
import type { PlanningPrisma } from '../prisma.js';

/**
 * Manager/org-hierarchy forecast roll-up.
 *
 * Rolls per-rep forecasts up the reporting tree (rep → manager → VP) using the
 * org chart owned by auth-service (`UserProfile.managerId`), instead of a single
 * flat team total. For each node we return BOTH its own (leaf) forecast and the
 * rolled-up subtree total, plus quota attainment (quota from planning, actuals
 * from analytics, commit from CRM).
 *
 * Every cross-service call is guarded and fail-open:
 *  - org chart unavailable  → flat tree (every rep is a root)
 *  - CRM rep-summary fails   → zeros for forecast
 *  - analytics fails         → zero actuals
 * so the endpoint always returns a usable (if degraded) structure, never 500s.
 */

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';
const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3008';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const FETCH_TIMEOUT_MS = 5_000;

interface OrgNode {
  userId: string;
  name?: string;
  jobTitle?: string | null;
  directReports?: OrgNode[];
}

interface RepForecast {
  ownerId: string;
  ownerName: string;
  commit: number;
  bestCase: number;
  pipeline: number;
  weighted: number;
  aiWeighted: number;
}

export interface HierarchyNode {
  userId: string;
  name: string;
  jobTitle: string | null;
  /** This user's own rep forecast (0s for a pure manager with no owned deals). */
  own: {
    commit: string;
    bestCase: string;
    pipeline: string;
    weighted: string;
    aiWeighted: string;
    quota: string;
    actual: string;
    attainmentPct: string;
    gapToQuota: string;
  };
  /** Subtree roll-up: this node + all descendants. */
  rolledUp: {
    commit: string;
    bestCase: string;
    pipeline: string;
    weighted: string;
    aiWeighted: string;
    quota: string;
    actual: string;
    attainmentPct: string;
    gapToQuota: string;
    repCount: number;
  };
  directReports: HierarchyNode[];
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Flatten the nested org chart into userId → { name, jobTitle, managerId }. */
function flattenOrg(roots: OrgNode[]): {
  users: Map<string, { name: string; jobTitle: string | null; managerId: string | null }>;
  order: string[];
} {
  const users = new Map<string, { name: string; jobTitle: string | null; managerId: string | null }>();
  const order: string[] = [];
  const walk = (node: OrgNode, managerId: string | null): void => {
    if (!node || !node.userId) return;
    if (!users.has(node.userId)) {
      users.set(node.userId, {
        name: node.name ?? node.userId.slice(0, 8),
        jobTitle: node.jobTitle ?? null,
        managerId,
      });
      order.push(node.userId);
    }
    for (const child of node.directReports ?? []) walk(child, node.userId);
  };
  for (const r of roots) walk(r, null);
  return { users, order };
}

/** Map a period key ("2026-Q2" | "this_quarter" | …) to { year, quarter }. */
function periodToYearQuarter(period: string): { year: number; quarter?: number } {
  const q = /^(\d{4})-Q([1-4])$/.exec(period.trim());
  if (q) return { year: Number(q[1]), quarter: Number(q[2]) };
  const now = new Date();
  const year = now.getUTCFullYear();
  if (period === 'this_quarter' || period === 'next_quarter') {
    let quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    if (period === 'next_quarter') quarter += 1;
    return { year: quarter > 4 ? year + 1 : year, quarter: quarter > 4 ? 1 : quarter };
  }
  return { year };
}

export function createForecastHierarchyService(prisma: PlanningPrisma) {
  return {
    async getHierarchyRollup(tenantId: string, period: string, bearer?: string) {
      const authHeaders: Record<string, string> = {
        'x-tenant-id': tenantId,
        Accept: 'application/json',
      };
      if (bearer) authHeaders.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`;
      if (INTERNAL_SERVICE_TOKEN) authHeaders['x-service-token'] = INTERNAL_SERVICE_TOKEN;

      // 1. Org chart (nested reporting tree). Fail-open → empty.
      const orgBody = (await fetchJson(`${AUTH_SERVICE_URL}/api/v1/org-chart`, authHeaders)) as
        | { data?: OrgNode[] }
        | null;
      const roots = Array.isArray(orgBody?.data) ? (orgBody!.data as OrgNode[]) : [];
      const { users, order } = flattenOrg(roots);

      // 2. Per-rep forecast from CRM (commit/bestCase/pipeline/weighted/aiWeighted).
      const repBody = (await fetchJson(
        `${CRM_SERVICE_URL}/api/v1/forecast/rep-summary?periodKey=${encodeURIComponent(period)}`,
        authHeaders
      )) as { data?: RepForecast[] } | null;
      const repById = new Map<string, RepForecast>();
      for (const r of repBody?.data ?? []) {
        if (r && typeof r.ownerId === 'string') repById.set(r.ownerId, r);
      }

      // 3. Actuals (closed-won) from analytics by-rep.
      const { year, quarter } = periodToYearQuarter(period);
      const analyticsQs = new URLSearchParams({ year: String(year) });
      if (quarter) analyticsQs.set('quarter', String(quarter));
      const actualBody = (await fetchJson(
        `${ANALYTICS_SERVICE_URL}/api/v1/analytics/revenue/by-rep?${analyticsQs.toString()}`,
        authHeaders
      )) as { data?: Array<{ ownerId: string; totalRevenue: number | string }> } | null;
      const actualById = new Map<string, Decimal>();
      for (const a of actualBody?.data ?? []) {
        if (a && typeof a.ownerId === 'string') actualById.set(a.ownerId, new Decimal(a.totalRevenue ?? 0));
      }

      // 4. Quotas from planning (tenant-scoped via ALS set in the request preHandler).
      const plan = await prisma.quotaPlan.findFirst({
        where: { tenantId, year, quarter: quarter ?? null, isActive: true },
        include: { targets: true },
        orderBy: { createdAt: 'desc' },
      });
      const quotaById = new Map<string, Decimal>();
      for (const t of plan?.targets ?? []) quotaById.set(t.ownerId, new Decimal(t.targetValue.toString()));

      // Any rep with a forecast/quota/actual but NOT in the org chart becomes a
      // root so its numbers are never dropped from the roll-up.
      const extraRoots = new Set<string>();
      for (const id of [...repById.keys(), ...quotaById.keys(), ...actualById.keys()]) {
        if (!users.has(id)) {
          users.set(id, { name: repById.get(id)?.ownerName ?? id.slice(0, 8), jobTitle: null, managerId: null });
          order.push(id);
          extraRoots.add(id);
        }
      }

      const childrenOf = new Map<string, string[]>();
      const rootIds: string[] = [];
      for (const id of order) {
        const managerId = users.get(id)!.managerId;
        if (managerId && users.has(managerId)) {
          const arr = childrenOf.get(managerId) ?? [];
          arr.push(id);
          childrenOf.set(managerId, arr);
        } else {
          rootIds.push(id);
        }
      }

      const pct = (actual: Decimal, quota: Decimal): string =>
        quota.gt(0) ? actual.div(quota).mul(100).toFixed(2) : '0.00';

      const build = (userId: string, seen: Set<string>): HierarchyNode => {
        seen.add(userId);
        const meta = users.get(userId)!;
        const rep = repById.get(userId);
        const ownCommit = new Decimal(rep?.commit ?? 0);
        const ownBest = new Decimal(rep?.bestCase ?? 0);
        const ownPipeline = new Decimal(rep?.pipeline ?? 0);
        const ownWeighted = new Decimal(rep?.weighted ?? 0);
        const ownAi = new Decimal(rep?.aiWeighted ?? 0);
        const ownQuota = quotaById.get(userId) ?? new Decimal(0);
        const ownActual = actualById.get(userId) ?? new Decimal(0);

        const children = (childrenOf.get(userId) ?? [])
          .filter((c) => !seen.has(c))
          .map((c) => build(c, seen));

        // Roll up subtree = own + sum(children.rolledUp).
        let rCommit = ownCommit;
        let rBest = ownBest;
        let rPipeline = ownPipeline;
        let rWeighted = ownWeighted;
        let rAi = ownAi;
        let rQuota = ownQuota;
        let rActual = ownActual;
        let repCount = rep || ownQuota.gt(0) || ownActual.gt(0) ? 1 : 0;
        for (const child of children) {
          rCommit = rCommit.plus(child.rolledUp.commit);
          rBest = rBest.plus(child.rolledUp.bestCase);
          rPipeline = rPipeline.plus(child.rolledUp.pipeline);
          rWeighted = rWeighted.plus(child.rolledUp.weighted);
          rAi = rAi.plus(child.rolledUp.aiWeighted);
          rQuota = rQuota.plus(child.rolledUp.quota);
          rActual = rActual.plus(child.rolledUp.actual);
          repCount += child.rolledUp.repCount;
        }

        return {
          userId,
          name: meta.name,
          jobTitle: meta.jobTitle,
          own: {
            commit: ownCommit.toFixed(2),
            bestCase: ownBest.toFixed(2),
            pipeline: ownPipeline.toFixed(2),
            weighted: ownWeighted.toFixed(2),
            aiWeighted: ownAi.toFixed(2),
            quota: ownQuota.toFixed(2),
            actual: ownActual.toFixed(2),
            attainmentPct: pct(ownActual, ownQuota),
            gapToQuota: Decimal.max(ownQuota.minus(ownActual), 0).toFixed(2),
          },
          rolledUp: {
            commit: rCommit.toFixed(2),
            bestCase: rBest.toFixed(2),
            pipeline: rPipeline.toFixed(2),
            weighted: rWeighted.toFixed(2),
            aiWeighted: rAi.toFixed(2),
            quota: rQuota.toFixed(2),
            actual: rActual.toFixed(2),
            attainmentPct: pct(rActual, rQuota),
            gapToQuota: Decimal.max(rQuota.minus(rActual), 0).toFixed(2),
            repCount,
          },
          directReports: children,
        };
      };

      const seen = new Set<string>();
      const tree = rootIds.filter((id) => !seen.has(id)).map((id) => build(id, seen));

      const grand = tree.reduce(
        (acc, n) => ({
          commit: acc.commit.plus(n.rolledUp.commit),
          bestCase: acc.bestCase.plus(n.rolledUp.bestCase),
          pipeline: acc.pipeline.plus(n.rolledUp.pipeline),
          weighted: acc.weighted.plus(n.rolledUp.weighted),
          aiWeighted: acc.aiWeighted.plus(n.rolledUp.aiWeighted),
          quota: acc.quota.plus(n.rolledUp.quota),
          actual: acc.actual.plus(n.rolledUp.actual),
          repCount: acc.repCount + n.rolledUp.repCount,
        }),
        {
          commit: new Decimal(0),
          bestCase: new Decimal(0),
          pipeline: new Decimal(0),
          weighted: new Decimal(0),
          aiWeighted: new Decimal(0),
          quota: new Decimal(0),
          actual: new Decimal(0),
          repCount: 0,
        }
      );

      return {
        period,
        orgChartAvailable: roots.length > 0,
        tree,
        grandTotal: {
          commit: grand.commit.toFixed(2),
          bestCase: grand.bestCase.toFixed(2),
          pipeline: grand.pipeline.toFixed(2),
          weighted: grand.weighted.toFixed(2),
          aiWeighted: grand.aiWeighted.toFixed(2),
          quota: grand.quota.toFixed(2),
          actual: grand.actual.toFixed(2),
          attainmentPct: pct(grand.actual, grand.quota),
          gapToQuota: Decimal.max(grand.quota.minus(grand.actual), 0).toFixed(2),
          repCount: grand.repCount,
        },
      };
    },
  };
}

export type ForecastHierarchyService = ReturnType<typeof createForecastHierarchyService>;
