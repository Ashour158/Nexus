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
    const stages = state.pipelines.find((pipeline) => pipeline.isDefault)?.stages ?? [];
    const total = state.deals.length || 1;
    return NextResponse.json({
      success: true,
      data: stages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stage) => {
          const count = state.deals.filter((deal) => deal.stageId === stage.id).length;
          const value = state.deals
            .filter((deal) => deal.stageId === stage.id)
            .reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0);
          return {
            stageId: stage.id,
            stageName: stage.name,
            count,
            value,
            conversionRate: Math.round((count / total) * 100),
          };
        }),
    });
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(
      `${ANALYTICS_SERVICE}/api/v1/analytics/pipeline/funnel${qs ? `?${qs}` : ''}`,
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
