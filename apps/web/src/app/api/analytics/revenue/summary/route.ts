import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const ANALYTICS_SERVICE =
  process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3008';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
  };
}

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();
    const inYear = state.deals.filter(
      (deal) => new Date(deal.updatedAt).getFullYear() === year
    );
    const won = inYear.filter((deal) => deal.status === 'WON');
    const lost = inYear.filter((deal) => deal.status === 'LOST');
    const totalRevenue = won.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0);
    const decided = won.length + lost.length;
    return NextResponse.json({
      success: true,
      data: {
        totalRevenue,
        wonDeals: won.length,
        lostDeals: lost.length,
        winRate: decided ? Math.round((won.length / decided) * 100) : 0,
        avgSalePrice: won.length ? Math.round(totalRevenue / won.length) : 0,
      },
    });
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(
      `${ANALYTICS_SERVICE}/api/v1/analytics/revenue/summary${qs ? `?${qs}` : ''}`,
      { headers: fwd(req), cache: 'no-store' }
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            err instanceof Error ? err.message : 'Failed to connect to analytics service',
        },
      },
      { status: 503 }
    );
  }
}
