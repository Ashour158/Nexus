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

const DEFAULT_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];

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

  const body = (await response.json()) as {
    data?: Array<{ stage?: string; value?: number; createdAt?: string; wonAt?: string; lostAt?: string }>;
  };
  const deals = body.data ?? [];

  const stageMap = new Map<string, { count: number; totalValue: number; totalDays: number }>();
  for (const s of DEFAULT_STAGES) {
    stageMap.set(s, { count: 0, totalValue: 0, totalDays: 0 });
  }

  let totalWon = 0;
  let totalLost = 0;
  let totalSalesDays = 0;
  let closedCount = 0;

  for (const deal of deals) {
    const stageName = deal.stage ?? 'Unknown';
    if (!stageMap.has(stageName)) {
      stageMap.set(stageName, { count: 0, totalValue: 0, totalDays: 0 });
    }
    const entry = stageMap.get(stageName)!;
    entry.count++;
    entry.totalValue += deal.value ?? 0;
    stageMap.set(stageName, entry);

    if (deal.stage === 'Closed Won' || (deal.wonAt && stageName.includes('Won'))) totalWon++;
    if (deal.stage === 'Closed Lost') totalLost++;

    const createdAt = deal.createdAt ? new Date(deal.createdAt) : null;
    if (deal.wonAt && createdAt) {
      const days = (new Date(deal.wonAt).getTime() - createdAt.getTime()) / 86400000;
      totalSalesDays += days;
      closedCount++;
    }
  }

  const stagesArray = DEFAULT_STAGES.filter((stageName) => stageMap.has(stageName)).map((stageName, i, arr) => {
    const current = stageMap.get(stageName)!;
    const nextName = i < arr.length - 1 ? DEFAULT_STAGES[i + 1] : null;
    const next = nextName ? stageMap.get(nextName) : null;
    const conversionRate = current.count > 0 && next && next.count > 0 ? (next.count / current.count) * 100 : 0;
    const dropOff = conversionRate >= 100 ? 0 : 100 - conversionRate;
    return {
      stage: stageName,
      count: current.count,
      totalValue: current.totalValue,
      avgDaysInStage: current.count > 0 ? Math.round(current.totalDays / current.count) : 0,
      conversionRate: Math.round(conversionRate * 10) / 10,
      dropOffRate: Math.round(dropOff * 10) / 10,
    };
  });

  /** Also include dynamically discovered stages not in DEFAULT_STAGES */
  const extra = Array.from(stageMap.keys()).filter((k) => !DEFAULT_STAGES.includes(k));
  for (const k of extra) {
    const current = stageMap.get(k)!;
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
