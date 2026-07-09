import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const R = process.env.REPORTING_SERVICE_URL;

function previewManagerReport() {
  const state = getDevPreviewState();
  const byOwner = new Map<string, { commit: number; best: number; pipeline: number; weighted: number }>();

  for (const deal of state.deals) {
    const current = byOwner.get(deal.ownerId) ?? { commit: 0, best: 0, pipeline: 0, weighted: 0 };
    const amount = Number(deal.amount) || 0;
    current.pipeline += amount;
    current.weighted += Math.round(amount * (Number(deal.probability) || 0) / 100);
    if (deal.forecastCategory === 'COMMIT') current.commit += amount;
    if (deal.forecastCategory === 'BEST_CASE') current.best += amount;
    byOwner.set(deal.ownerId, current);
  }

  const forecast = Array.from(byOwner.entries()).map(([ownerId, row], index) => {
    const user = state.users.find((candidate) => candidate.id === ownerId);
    return {
      rep: user ? `${user.firstName} ${user.lastName}` : ownerId,
      commit: row.commit,
      best: row.best,
      pipeline: row.pipeline,
      weighted: row.weighted,
      quota: index === 0 ? 320000 : 180000,
    };
  });

  return {
    totalQuota: forecast.reduce((sum, row) => sum + row.quota, 0),
    totalRevenue: forecast.reduce((sum, row) => sum + row.weighted, 0),
    forecast,
    coaching: [
      { rep: 'Sara Manager', metric: 'Late-stage follow-up', deviation: '2 negotiation deals need next steps' },
      { rep: 'Dev Admin', metric: 'MEDDIC completion', deviation: 'Champion notes missing on 1 deal' },
      { rep: 'Mona Farouk', metric: 'Response SLA', deviation: 'Average response above 4 hour target' },
    ],
    heatmap: [
      { stage: 'Qualified', small: 2, medium: 4, large: 1 },
      { stage: 'Proposal', small: 1, medium: 5, large: 3 },
      { stage: 'Negotiation', small: 0, medium: 3, large: 6 },
      { stage: 'Closed Won', small: 0, medium: 1, large: 2 },
    ],
  };
}

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(previewManagerReport());
  }

  if (!R) {
    return NextResponse.json(
      {
        error: 'SERVICE_UNAVAILABLE',
        message: 'Reporting service is not configured. Manager reports are not yet available.',
      },
      { status: 503 }
    );
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${R}/api/v1/reports/manager${qs ? `?${qs}` : ''}`, {
      headers: {
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
        authorization: req.headers.get('authorization') ?? '',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: text || 'Reporting service returned an error' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
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
