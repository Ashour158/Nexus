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
    const probById = new Map(stages.map((stage) => [stage.id, stage.probability]));
    const open = state.deals.filter((deal) => deal.status === 'OPEN');

    let total = 0;
    let weighted = 0;
    const byMonth = new Map<string, { weighted: number; total: number }>();
    for (const deal of open) {
      const amount = Number(deal.amount) || 0;
      const prob = (probById.get(deal.stageId) ?? 0) / 100;
      total += amount;
      weighted += amount * prob;
      const month = new Date(deal.updatedAt).toISOString().slice(0, 7);
      const bucket = byMonth.get(month) ?? { weighted: 0, total: 0 };
      bucket.total += amount;
      bucket.weighted += amount * prob;
      byMonth.set(month, bucket);
    }
    const won = state.deals.filter((deal) => deal.status === 'WON').length;
    const lost = state.deals.filter((deal) => deal.status === 'LOST').length;
    const decided = won + lost;

    return NextResponse.json({
      success: true,
      data: {
        weightedPipeline: String(Math.round(weighted)),
        totalPipeline: String(Math.round(total)),
        winRate: decided ? ((won / decided) * 100).toFixed(1) : '0.0',
        forecastByMonth: [...byMonth.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, bucket]) => ({
            month,
            weighted: String(Math.round(bucket.weighted)),
            total: String(Math.round(bucket.total)),
          })),
      },
    });
  }

  try {
    const res = await fetch(
      `${ANALYTICS_SERVICE}/api/v1/analytics/forecast/weighted-pipeline`,
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
