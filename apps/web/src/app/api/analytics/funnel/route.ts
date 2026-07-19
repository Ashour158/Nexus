import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const stages = state.pipelines.find((pipeline) => pipeline.isDefault)?.stages ?? [];
    const totalDeals = state.deals.length;
    const totalWon = state.deals.filter((deal) => deal.status === 'WON').length;
    const totalLost = state.deals.filter((deal) => deal.status === 'LOST').length;

    return NextResponse.json({
      stages: stages.map((stage) => {
        const stageDeals = state.deals.filter((deal) => deal.stageId === stage.id);
        return {
          stage: stage.name,
          count: stageDeals.length,
          totalValue: stageDeals.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0),
          conversionRate: 0,
          dropOffRate: 0,
          // Preview state has no stage transition timestamps; zero is explicit unknown.
          avgDaysInStage: 0,
        };
      }),
      totalDeals,
      totalWon,
      totalLost,
      overallConversionRate:
        totalWon + totalLost > 0
          ? Math.round((totalWon / (totalWon + totalLost)) * 1000) / 10
          : 0,
      avgSalesCycledays: 0,
    });
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${R}/api/v1/analytics/funnel${qs ? `?${qs}` : ''}`, {
      headers: {
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
        authorization: req.headers.get('authorization') ?? '',
      },
      cache: 'no-store',
    });
    // The backend wraps the payload in { success, data }; the page consumes the
    // bare FunnelData (stages at top level, matching the dev-preview shape
    // above). Unwrap so `data.stages` is defined — otherwise the page's
    // `data.stages.map(...)` throws on an HTTP-200 response.
    const body = (await res.json()) as { data?: unknown } | unknown;
    const payload = body && typeof body === 'object' && 'data' in body ? body.data : body;
    return NextResponse.json(payload, { status: res.status });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: 'SERVICE_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Failed to connect to reporting service',
      },
      { status: 503 }
    );
  }
}
