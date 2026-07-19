const DAY_MS = 86_400_000;

export interface CanonicalDeal {
  id: string;
  name?: string;
  ownerId?: string;
  accountId?: string;
  pipelineId?: string;
  stageId?: string;
  stage?: string;
  status?: string;
  value?: number;
  amount?: number;
  probability?: number;
  lostReason?: string;
  createdAt?: string;
  updatedAt?: string;
  actualCloseDate?: string;
  wonAt?: string;
  lostAt?: string;
}

export interface DealSummary {
  totalDeals: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  wonAmount: number;
  lostAmount: number;
  pipelineValue: number;
  weightedPipeline: number;
  totalRevenue: number;
  winRatePct: number;
  avgWonDealSize: number;
}

export function isWonDeal(deal: Pick<CanonicalDeal, 'status'>): boolean {
  return deal.status === 'WON';
}

export function isLostDeal(deal: Pick<CanonicalDeal, 'status'>): boolean {
  return deal.status === 'LOST';
}

export function isOpenDeal(deal: Pick<CanonicalDeal, 'status'>): boolean {
  return !isWonDeal(deal) && !isLostDeal(deal);
}

export function dealAmount(deal: Pick<CanonicalDeal, 'amount' | 'value'>): number {
  const raw = deal.amount ?? deal.value ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function summarizeDeals(deals: CanonicalDeal[]): DealSummary {
  let wonDeals = 0;
  let lostDeals = 0;
  let openDeals = 0;
  let wonAmount = 0;
  let lostAmount = 0;
  let pipelineValue = 0;
  let weightedPipeline = 0;

  for (const deal of deals) {
    const amount = dealAmount(deal);
    if (isWonDeal(deal)) {
      wonDeals += 1;
      wonAmount += amount;
    } else if (isLostDeal(deal)) {
      lostDeals += 1;
      lostAmount += amount;
    } else {
      openDeals += 1;
      pipelineValue += amount;
      const probability = Number(deal.probability ?? 0);
      const probabilityPct = Number.isFinite(probability)
        ? Math.min(100, Math.max(0, probability))
        : 0;
      weightedPipeline += amount * (probabilityPct / 100);
    }
  }

  const decidedDeals = wonDeals + lostDeals;
  return {
    totalDeals: deals.length,
    openDeals,
    wonDeals,
    lostDeals,
    wonAmount,
    lostAmount,
    pipelineValue,
    weightedPipeline,
    // Compatibility alias. Revenue is won-only; it never includes open/lost value.
    totalRevenue: wonAmount,
    winRatePct: decidedDeals > 0 ? (wonDeals / decidedDeals) * 100 : 0,
    avgWonDealSize: wonDeals > 0 ? wonAmount / wonDeals : 0,
  };
}

export async function fetchCanonicalDeals(
  tenantId: string,
  options: { from?: Date; to?: Date; pipelineId?: string; limit?: number } = {}
): Promise<CanonicalDeal[]> {
  const crm = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  const url = new URL(`${crm}/api/v1/internal/reporting/deals`);
  url.searchParams.set('limit', String(options.limit ?? 5000));
  if (options.from) url.searchParams.set('from', options.from.toISOString());
  if (options.to) url.searchParams.set('to', options.to.toISOString());
  if (options.pipelineId) url.searchParams.set('pipelineId', options.pipelineId);

  const response = await fetch(url, {
    headers: {
      'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
      'x-tenant-id': tenantId,
    },
  });
  if (!response.ok) throw new Error(`CRM reporting returned ${response.status}`);

  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) throw new Error('CRM reporting returned a malformed deal list');
  return body.data as CanonicalDeal[];
}

export function buildWinLossReport(deals: CanonicalDeal[], from: Date, to: Date) {
  const summary = summarizeDeals(deals);
  const lostReasons = new Map<string, number>();
  const months = new Map<string, { won: number; lost: number }>();

  for (const deal of deals) {
    if (!isWonDeal(deal) && !isLostDeal(deal)) continue;
    if (isLostDeal(deal)) {
      const reason = deal.lostReason?.trim() || 'Unspecified';
      lostReasons.set(reason, (lostReasons.get(reason) ?? 0) + 1);
    }

    const dateValue =
      (isWonDeal(deal) ? deal.wonAt : deal.lostAt) ??
      deal.actualCloseDate ??
      deal.updatedAt;
    const date = dateValue ? new Date(dateValue) : null;
    if (!date || !Number.isFinite(date.getTime())) continue;
    const month = date.toISOString().slice(0, 7);
    const bucket = months.get(month) ?? { won: 0, lost: 0 };
    if (isWonDeal(deal)) bucket.won += 1;
    else bucket.lost += 1;
    months.set(month, bucket);
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    refreshedAt: new Date().toISOString(),
    source: 'crm-read-model',
    summary: {
      totalDeals: summary.wonDeals + summary.lostDeals,
      openDeals: summary.openDeals,
      wonDeals: summary.wonDeals,
      lostDeals: summary.lostDeals,
      winRatePct: roundPct(summary.winRatePct),
      wonAmount: summary.wonAmount,
      lostAmount: summary.lostAmount,
      // Compatibility aliases for existing clients.
      wonRevenue: summary.wonAmount,
      lostRevenue: summary.lostAmount,
    },
    lostReasons: [...lostReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    monthlyTrend: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, counts]) => ({
        month,
        ...counts,
        winRatePct: roundPct(
          counts.won + counts.lost > 0 ? (counts.won / (counts.won + counts.lost)) * 100 : 0
        ),
      })),
  };
}

export function dateRangeFromDays(days: number, now = new Date()): { from: Date; to: Date } {
  const safeDays = Number.isFinite(days) ? Math.min(3650, Math.max(1, Math.floor(days))) : 90;
  return { from: new Date(now.getTime() - safeDays * DAY_MS), to: now };
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}
