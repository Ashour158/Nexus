import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const stages = state.pipelines.find((pipeline) => pipeline.isDefault)?.stages ?? [];
    const totalDeals = state.deals.length;
    const totalWon = state.deals.filter((deal) => deal.status === 'WON').length;

    return NextResponse.json({
      stages: stages.map((stage, index) => {
        const count = Math.max(
          state.deals.filter((deal) => deal.stageId === stage.id).length,
          totalDeals - index * 2
        );
        return {
          stage: stage.name,
          count,
          totalValue: state.deals
            .filter((deal) => deal.stageId === stage.id || index < 2)
            .reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0),
          conversionRate: stage.probability,
          dropOffRate: index === 0 ? 0 : Math.max(0, 100 - stage.probability),
          avgDaysInStage: [3, 8, 14, 11, 1][index] ?? 5,
        };
      }),
      totalDeals,
      totalWon,
      overallConversionRate: totalDeals > 0 ? Math.round((totalWon / totalDeals) * 100) : 0,
      avgSalesCycledays: 42,
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
    return NextResponse.json(await res.json(), { status: res.status });
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
