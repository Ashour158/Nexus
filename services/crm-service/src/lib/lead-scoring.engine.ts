import type { CrmPrisma } from '../prisma.js';

type ScoringSignal = {
  signal: string;
  points: number;
  condition: Record<string, unknown>;
};

export const DEFAULT_SIGNALS: ScoringSignal[] = [
  { signal: 'email_opened', points: 5, condition: {} },
  { signal: 'meeting_booked', points: 15, condition: {} },
  { signal: 'demo_requested', points: 20, condition: {} },
  { signal: 'form_submit', points: 10, condition: {} },
  { signal: 'page_view', points: 2, condition: {} },
  { signal: 'company_size', points: 10, condition: { minEmployees: 50 } },
  {
    signal: 'industry_match',
    points: 8,
    condition: { industries: ['SaaS', 'FinTech', 'E-commerce', 'Retail'] },
  },
  { signal: 'recency_decay', points: -2, condition: { perDay: true } },
];

function tierFromScore(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export async function recalculateLeadScore(
  prisma: CrmPrisma,
  tenantId: string,
  leadId: string
): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 200 },
    },
  });
  if (!lead) return;

  const tenantRules = await prisma.leadScoringRule.findMany({
    where: { tenantId, isActive: true },
  });
  const rules: ScoringSignal[] =
    tenantRules.length > 0
      ? tenantRules.map((r) => ({
          signal: r.signal,
          points: r.points,
          condition: (r.condition ?? {}) as Record<string, unknown>,
        }))
      : DEFAULT_SIGNALS;

  let totalScore = 0;
  const signalBreakdown: Record<string, number> = {};
  const activityTypeMappings: Record<string, string> = {
    EMAIL: 'email_opened',
    MEETING: 'meeting_booked',
    DEMO: 'demo_requested',
  };

  for (const activity of lead.activities) {
    const signalKey = activityTypeMappings[activity.type];
    if (!signalKey) continue;
    const rule = rules.find((r) => r.signal === signalKey);
    if (!rule) continue;
    totalScore += rule.points;
    signalBreakdown[signalKey] = (signalBreakdown[signalKey] ?? 0) + rule.points;
  }

  const companySizeRule = rules.find((r) => r.signal === 'company_size');
  if (companySizeRule && lead.company) {
    const account = await prisma.account
      .findFirst({
        where: { tenantId, name: lead.company },
        select: { employeeCount: true },
      })
      .catch(() => null);
    const minEmp = Number(companySizeRule.condition.minEmployees ?? 50);
    if (account?.employeeCount && account.employeeCount >= minEmp) {
      totalScore += companySizeRule.points;
      signalBreakdown.company_size = companySizeRule.points;
    }
  }

  const industryRule = rules.find((r) => r.signal === 'industry_match');
  if (industryRule && lead.industry) {
    const matched = (industryRule.condition.industries as string[] | undefined) ?? [];
    if (matched.includes(lead.industry)) {
      totalScore += industryRule.points;
      signalBreakdown.industry_match = industryRule.points;
    }
  }

  const decayRule = rules.find((r) => r.signal === 'recency_decay');
  if (decayRule && lead.activities.length > 0) {
    const lastActivity = lead.activities[0];
    const daysSince = Math.floor(
      (Date.now() - lastActivity.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const decay = daysSince * Math.abs(decayRule.points);
    totalScore = Math.max(0, totalScore - decay);
    signalBreakdown.recency_decay = -decay;
  }

  const finalScore = Math.min(100, Math.max(0, totalScore));
  const tier = tierFromScore(finalScore);

  await prisma.leadScore.upsert({
    where: { leadId },
    create: {
      tenantId,
      leadId,
      score: finalScore,
      tier,
      signals: signalBreakdown,
      scoredAt: new Date(),
    },
    update: {
      score: finalScore,
      tier,
      signals: signalBreakdown,
      scoredAt: new Date(),
    },
  });
}

export async function recalculateAccountHealth(
  prisma: CrmPrisma,
  tenantId: string,
  accountId: string
): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, tenantId },
    include: {
      deals: { select: { status: true, amount: true, updatedAt: true }, take: 100 },
      activities: { orderBy: { createdAt: 'desc' }, take: 50, select: { createdAt: true } },
    },
  });
  if (!account) return;

  const signals: Record<string, number> = {};
  let score = 50;

  const wonDeals = account.deals.filter((d) => d.status === 'WON').length;
  const lostDeals = account.deals.filter((d) => d.status === 'LOST').length;
  const openDeals = account.deals.filter((d) => d.status === 'OPEN' || d.status === 'DORMANT').length;

  if (wonDeals > 0) {
    const pts = Math.min(20, wonDeals * 5);
    score += pts;
    signals.won_deals = pts;
  }
  if (lostDeals > 0) {
    const pts = Math.min(15, lostDeals * 5);
    score -= pts;
    signals.lost_deals = -pts;
  }
  if (openDeals > 0) {
    const pts = Math.min(10, openDeals * 3);
    score += pts;
    signals.open_deals = pts;
  }

  const lastActivity = account.activities[0];
  if (lastActivity) {
    const daysSince = Math.floor(
      (Date.now() - lastActivity.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince <= 7) {
      score += 15;
      signals.recent_activity = 15;
    } else if (daysSince <= 30) {
      score += 5;
      signals.recent_activity = 5;
    } else if (daysSince > 90) {
      score -= 20;
      signals.inactive_90d = -20;
    } else if (daysSince > 60) {
      score -= 10;
      signals.inactive_60d = -10;
    }
  } else {
    score -= 25;
    signals.no_activity = -25;
  }

  const finalScore = Math.min(100, Math.max(0, score));
  const churnProbability = Number((1 - finalScore / 100).toFixed(2));
  const riskLevel =
    finalScore < 30 ? 'critical' : finalScore < 50 ? 'high' : finalScore < 70 ? 'medium' : 'low';
  const lastActivityDays = lastActivity
    ? Math.floor((Date.now() - lastActivity.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  await prisma.accountHealthScore.upsert({
    where: { accountId },
    create: {
      tenantId,
      accountId,
      score: finalScore,
      riskLevel,
      churnProbability,
      signals,
      lastActivityDays,
      openDealsCount: openDeals,
      wonDealsCount: wonDeals,
      lostDealsCount: lostDeals,
      scoredAt: new Date(),
    },
    update: {
      score: finalScore,
      riskLevel,
      churnProbability,
      signals,
      lastActivityDays,
      openDealsCount: openDeals,
      wonDealsCount: wonDeals,
      lostDealsCount: lostDeals,
      scoredAt: new Date(),
    },
  });
}
