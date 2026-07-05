import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const tenantId = req.headers.get('x-tenant-id') || 'default';

  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(buildPreviewWinLoss(Number(searchParams.get('period') ?? 90)));
  }

  try {
    const res = await fetch(`${CRM_SERVICE}/api/v1/analytics/win-loss${qs ? `?${qs}` : ''}`, {
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
            err instanceof Error ? err.message : 'Failed to connect to CRM analytics service',
        },
      },
      { status: 503 }
    );
  }
}

function buildPreviewWinLoss(period: number) {
  const scale = period <= 30 ? 0.4 : period <= 90 ? 1 : period <= 180 ? 1.8 : 3.2;
  const totalDeals = Math.round(74 * scale);
  const wonDeals = Math.round(totalDeals * 0.61);
  const lostDeals = totalDeals - wonDeals;
  const wonRevenue = Math.round(1_480_000 * scale);
  const lostRevenue = Math.round(720_000 * scale);

  return {
    summary: {
      totalDeals,
      wonDeals,
      lostDeals,
      winRate: Math.round((wonDeals / totalDeals) * 100),
      wonRevenue,
      lostRevenue,
    },
    lostReasons: [
      { reason: 'Price exceeded budget', count: Math.max(2, Math.round(12 * scale)) },
      { reason: 'No decision / stalled', count: Math.max(2, Math.round(9 * scale)) },
      { reason: 'Competitor relationship', count: Math.max(1, Math.round(7 * scale)) },
      { reason: 'Missing integration', count: Math.max(1, Math.round(5 * scale)) },
      { reason: 'Procurement timing', count: Math.max(1, Math.round(4 * scale)) },
      { reason: 'Security review failed', count: Math.max(1, Math.round(3 * scale)) },
    ],
    monthlyTrend: [
      { month: 'Jan', won: 14, lost: 8, winRate: 64 },
      { month: 'Feb', won: 17, lost: 9, winRate: 65 },
      { month: 'Mar', won: 15, lost: 11, winRate: 58 },
      { month: 'Apr', won: 21, lost: 10, winRate: 68 },
      { month: 'May', won: 19, lost: 12, winRate: 61 },
      { month: 'Jun', won: 24, lost: 11, winRate: 69 },
    ],
    insights: [
      'Budget objections are concentrated in mid-market deals without early ROI confirmation.',
      'Integration gaps appear before proposal stage; add discovery validation to qualification.',
      'Champion strength correlates with higher close rate across enterprise opportunities.',
    ],
    serviceMap: ['crm-service', 'analytics-service', 'reporting-service', 'workflow-service'],
  };
}
