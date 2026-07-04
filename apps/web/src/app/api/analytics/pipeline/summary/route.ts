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
    const pipelineId = req.nextUrl.searchParams.get('pipelineId');
    const deals = pipelineId
      ? state.deals.filter((deal) => deal.pipelineId === pipelineId)
      : state.deals;
    const open = deals.filter((deal) => deal.status === 'OPEN');
    const totalValue = open.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0);
    const totalDeals = open.length;
    return NextResponse.json({
      success: true,
      data: {
        totalDeals,
        totalValue,
        avgDealSize: totalDeals ? Math.round(totalValue / totalDeals) : 0,
        avgDaysInPipeline: 34,
      },
    });
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(
      `${ANALYTICS_SERVICE}/api/v1/analytics/pipeline/summary${qs ? `?${qs}` : ''}`,
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
