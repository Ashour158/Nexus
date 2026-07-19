import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const REPORTING_SERVICE = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const tenantId = req.headers.get('x-tenant-id') || 'default';

  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json({
      success: true,
      data: buildPreviewWinLoss(Number(searchParams.get('period') ?? 90)),
    });
  }

  try {
    const res = await fetch(`${REPORTING_SERVICE}/api/v1/analytics/win-loss${qs ? `?${qs}` : ''}`, {
      headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    // Upstream unreachable: surface a real error instead of fabricating analytics.
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            err instanceof Error ? err.message : 'Failed to connect to reporting service',
        },
      },
      { status: 503 }
    );
  }
}

function buildPreviewWinLoss(period: number) {
  const state = getDevPreviewState();
  const now = new Date();
  const days = Number.isFinite(period) ? Math.min(3650, Math.max(1, period)) : 90;
  const from = new Date(now.getTime() - days * 86_400_000);
  const deals = state.deals.filter((deal) => {
    const date = new Date(deal.updatedAt);
    return Number.isFinite(date.getTime()) && date >= from && date <= now;
  });
  const won = deals.filter((deal) => deal.status === 'WON');
  const lost = deals.filter((deal) => deal.status === 'LOST');
  const decided = won.length + lost.length;
  const amount = (deal: (typeof deals)[number]) => Number(deal.amount) || 0;
  const reasons = new Map<string, number>();
  const months = new Map<string, { won: number; lost: number }>();
  for (const deal of [...won, ...lost]) {
    if (deal.status === 'LOST') {
      const reason =
        typeof deal.lostReason === 'string' && deal.lostReason.trim()
          ? deal.lostReason
          : 'Unspecified';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    const month = new Date(deal.updatedAt).toISOString().slice(0, 7);
    const bucket = months.get(month) ?? { won: 0, lost: 0 };
    bucket[deal.status === 'WON' ? 'won' : 'lost'] += 1;
    months.set(month, bucket);
  }

  return {
    period: { from: from.toISOString(), to: now.toISOString() },
    refreshedAt: now.toISOString(),
    source: 'dev-preview-state',
    summary: {
      totalDeals: decided,
      openDeals: deals.length - decided,
      wonDeals: won.length,
      lostDeals: lost.length,
      winRatePct: decided ? Math.round((won.length / decided) * 1000) / 10 : 0,
      wonAmount: won.reduce((sum, deal) => sum + amount(deal), 0),
      lostAmount: lost.reduce((sum, deal) => sum + amount(deal), 0),
      wonRevenue: won.reduce((sum, deal) => sum + amount(deal), 0),
      lostRevenue: lost.reduce((sum, deal) => sum + amount(deal), 0),
    },
    lostReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    monthlyTrend: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({
        month,
        ...bucket,
        winRatePct:
          bucket.won + bucket.lost
            ? Math.round((bucket.won / (bucket.won + bucket.lost)) * 1000) / 10
            : 0,
      })),
  };
}
