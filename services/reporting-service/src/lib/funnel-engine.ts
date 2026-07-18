import type { ReportingPrisma } from '../prisma.js';

export type FunnelStage = {
  stage: string;
  count: number;
  totalValue: number;
  avgDaysInStage: number;
  conversionRate: number;
  dropOffRate: number;
};

export type FunnelReport = {
  pipelineId: string | null;
  period: { from: string; to: string };
  stages: FunnelStage[];
  totalDeals: number;
  totalWon: number;
  totalLost: number;
  overallConversionRate: number;
  avgSalesCycledays: number;
};

/**
 * Ordered sales progression (terminal `Closed Lost` is NOT part of the linear
 * funnel — a lost deal exits the funnel, it does not "convert" to a next stage).
 */
const PROGRESSION = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'];
const WON_STAGE = 'Closed Won';
const LOST_STAGE = 'Closed Lost';
const DAY_MS = 86_400_000;

type RawDeal = {
  stage?: string;
  value?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  wonAt?: string;
  lostAt?: string;
};

function isWon(deal: RawDeal): boolean {
  return deal.status === 'WON' || deal.stage === WON_STAGE || Boolean(deal.wonAt);
}

function isLost(deal: RawDeal): boolean {
  return deal.status === 'LOST' || deal.stage === LOST_STAGE || Boolean(deal.lostAt);
}

/**
 * Furthest progression index a deal has demonstrably reached. Because CRM only
 * exposes each deal's CURRENT stage (no per-stage transition log), we model the
 * standard cumulative-funnel assumption: a deal sitting in stage `i` has passed
 * through every earlier stage, and a won deal reached the terminal Won stage.
 * A lost deal (or one whose current stage is off-progression) is only counted as
 * having entered the funnel (index 0), since we cannot know how far it advanced.
 */
function furthestIndex(deal: RawDeal): number {
  if (isWon(deal)) return PROGRESSION.length - 1;
  const idx = deal.stage ? PROGRESSION.indexOf(deal.stage) : -1;
  return idx >= 0 ? idx : 0;
}

export async function buildFunnelReport(
  _prisma: ReportingPrisma,
  tenantId: string,
  from: Date,
  to: Date,
  pipelineId?: string
): Promise<FunnelReport> {
  const crm = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const u = new URL(`${crm}/api/v1/internal/reporting/deals`);
  u.searchParams.set('from', from.toISOString());
  u.searchParams.set('to', to.toISOString());
  u.searchParams.set('limit', '5000');
  if (pipelineId) u.searchParams.set('pipelineId', pipelineId);

  const response = await fetch(u, {
    headers: {
      'x-service-token': token,
      'x-tenant-id': tenantId,
    },
  });

  if (!response.ok) {
    throw new Error(`CRM reporting returned ${response.status}`);
  }

  const body = (await response.json()) as { data?: RawDeal[] };
  const deals = body.data ?? [];

  // Per-stage occupancy (current stage), value, and accumulated dwell time.
  const stageMap = new Map<string, { count: number; totalValue: number; totalDays: number }>();
  for (const s of PROGRESSION) stageMap.set(s, { count: 0, totalValue: 0, totalDays: 0 });
  stageMap.set(LOST_STAGE, { count: 0, totalValue: 0, totalDays: 0 });

  // Cohort reach counts: reached[i] = # deals that reached progression stage i.
  const reached = new Array<number>(PROGRESSION.length).fill(0);

  const now = Date.now();
  let totalWon = 0;
  let totalLost = 0;
  let totalSalesDays = 0;
  let closedCount = 0;

  for (const deal of deals) {
    const stageName = deal.stage ?? 'Unknown';
    if (!stageMap.has(stageName)) stageMap.set(stageName, { count: 0, totalValue: 0, totalDays: 0 });
    const entry = stageMap.get(stageName)!;
    entry.count++;
    entry.totalValue += deal.value ?? 0;

    // avgDaysInStage: dwell in the CURRENT stage, measured from the last time the
    // deal moved (updatedAt is the best available proxy for stage-entry, since
    // there is no transition log) to now (or its close date, whichever applies).
    const enteredStage = deal.updatedAt
      ? new Date(deal.updatedAt).getTime()
      : deal.createdAt
        ? new Date(deal.createdAt).getTime()
        : now;
    const stageEnd = deal.wonAt
      ? new Date(deal.wonAt).getTime()
      : deal.lostAt
        ? new Date(deal.lostAt).getTime()
        : now;
    const dwellDays = (stageEnd - enteredStage) / DAY_MS;
    if (Number.isFinite(dwellDays) && dwellDays > 0) entry.totalDays += dwellDays;

    // Cohort reach: mark every progression stage up to the furthest reached.
    const fi = furthestIndex(deal);
    for (let i = 0; i <= fi && i < reached.length; i++) reached[i]++;

    if (isWon(deal)) totalWon++;
    if (isLost(deal)) totalLost++;

    const createdAt = deal.createdAt ? new Date(deal.createdAt) : null;
    if (deal.wonAt && createdAt) {
      const days = (new Date(deal.wonAt).getTime() - createdAt.getTime()) / DAY_MS;
      if (Number.isFinite(days) && days >= 0) {
        totalSalesDays += days;
        closedCount++;
      }
    }
  }

  const stagesArray: FunnelStage[] = PROGRESSION.map((stageName, i) => {
    const current = stageMap.get(stageName)!;
    // Real cohort conversion: of everyone who reached stage i, what fraction
    // went on to reach stage i+1.
    const reachedHere = reached[i];
    const reachedNext = i < reached.length - 1 ? reached[i + 1] : 0;
    const conversionRate = i < reached.length - 1 && reachedHere > 0 ? (reachedNext / reachedHere) * 100 : 0;
    const dropOff = i < reached.length - 1 ? 100 - conversionRate : 0;
    return {
      stage: stageName,
      count: current.count,
      totalValue: current.totalValue,
      avgDaysInStage: current.count > 0 ? Math.round(current.totalDays / current.count) : 0,
      conversionRate: Math.round(conversionRate * 10) / 10,
      dropOffRate: Math.round(Math.max(0, dropOff) * 10) / 10,
    };
  });

  // Terminal Closed Lost bucket (off-progression, no forward conversion).
  const lost = stageMap.get(LOST_STAGE)!;
  if (lost.count > 0) {
    stagesArray.push({
      stage: LOST_STAGE,
      count: lost.count,
      totalValue: lost.totalValue,
      avgDaysInStage: lost.count > 0 ? Math.round(lost.totalDays / lost.count) : 0,
      conversionRate: 0,
      dropOffRate: 0,
    });
  }

  // Any dynamically discovered stages not in the known set.
  const known = new Set<string>([...PROGRESSION, LOST_STAGE]);
  for (const [k, current] of stageMap.entries()) {
    if (known.has(k)) continue;
    stagesArray.push({
      stage: k,
      count: current.count,
      totalValue: current.totalValue,
      avgDaysInStage: current.count > 0 ? Math.round(current.totalDays / current.count) : 0,
      conversionRate: 0,
      dropOffRate: 0,
    });
  }

  return {
    pipelineId: pipelineId ?? null,
    period: { from: from.toISOString(), to: to.toISOString() },
    stages: stagesArray,
    totalDeals: deals.length,
    totalWon,
    totalLost,
    overallConversionRate: deals.length > 0 ? Math.round((totalWon / deals.length) * 1000) / 10 : 0,
    avgSalesCycledays: closedCount > 0 ? Math.round(totalSalesDays / closedCount) : 0,
  };
}
