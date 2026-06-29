import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const R = process.env.REPORTING_SERVICE_URL;

function previewPipelineReport() {
  const state = getDevPreviewState();
  const stages = state.pipelines.find((pipeline) => pipeline.isDefault)?.stages ?? [];

  return {
    funnel: stages.map((stage) => {
      const deals = state.deals.filter((deal) => deal.stageId === stage.id);
      return {
        stage: stage.name,
        deals: deals.length,
        value: deals.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0),
        conversion: stage.probability,
      };
    }),
    dealFlow: [
      { month: 'Jan', created: 18, won: 4, lost: 2 },
      { month: 'Feb', created: 22, won: 6, lost: 3 },
      { month: 'Mar', created: 25, won: 8, lost: 4 },
      { month: 'Apr', created: 29, won: 9, lost: 3 },
      { month: 'May', created: 31, won: 11, lost: 4 },
    ],
    stageDays: [
      { stage: 'New', days: 4 },
      { stage: 'Qualified', days: 9 },
      { stage: 'Proposal', days: 14 },
      { stage: 'Negotiation', days: 11 },
      { stage: 'Closed Won', days: 2 },
    ],
    cohort: [
      { month: 'Jan', qualification: 18, proposal: 11, negotiation: 7, commit: 4 },
      { month: 'Feb', qualification: 22, proposal: 14, negotiation: 9, commit: 6 },
      { month: 'Mar', qualification: 25, proposal: 16, negotiation: 10, commit: 8 },
      { month: 'Apr', qualification: 29, proposal: 18, negotiation: 11, commit: 7 },
    ],
    stats: {
      stalled: 4,
      projectedClose: 261000,
    },
  };
}

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(previewPipelineReport());
  }

  if (!R) {
    return NextResponse.json(
      {
        error: 'SERVICE_UNAVAILABLE',
        message: 'Reporting service is not configured. Pipeline analytics are not yet available.',
      },
      { status: 503 }
    );
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${R}/api/v1/reports/pipeline${qs ? `?${qs}` : ''}`, {
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
