import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const R = process.env.REPORTING_SERVICE_URL;

function previewPerformanceReport() {
  const state = getDevPreviewState();
  const performance = state.deals.map((deal) => {
    const owner = state.users.find((user) => user.id === deal.ownerId);
    const ownerName = owner ? `${owner.firstName} ${owner.lastName}` : String(deal.ownerId);
    const status =
      deal.status === 'WON'
        ? 'CLOSED WON'
        : deal.status === 'LOST'
          ? 'CLOSED LOST'
          : 'IN PROGRESS';

    return {
      id: deal.id,
      date: String(deal.updatedAt),
      customer: String(deal.accountName),
      customerSubtitle: String(deal.name),
      ownerName,
      ownerAvatar: null,
      dealValue: Number(deal.amount) || 0,
      status,
    };
  });
  const won = state.deals.filter((deal) => deal.status === 'WON');
  const lost = state.deals.filter((deal) => deal.status === 'LOST');
  const open = state.deals.filter(
    (deal) => deal.status !== 'WON' && deal.status !== 'LOST'
  );
  const amount = (deal: (typeof state.deals)[number]) => Number(deal.amount) || 0;
  const decided = won.length + lost.length;
  const stages = state.pipelines.find((pipeline) => pipeline.isDefault)?.stages ?? [];
  const probabilityByStage = new Map(stages.map((stage) => [stage.id, stage.probability]));
  const wonAmount = won.reduce((sum, deal) => sum + amount(deal), 0);
  const pipelineValue = open.reduce((sum, deal) => sum + amount(deal), 0);
  const weightedPipeline = open.reduce(
    (sum, deal) =>
      sum + amount(deal) * ((probabilityByStage.get(deal.stageId) ?? 0) / 100),
    0
  );

  return {
    wonAmount,
    totalRevenue: wonAmount,
    pipelineValue,
    weightedPipeline,
    wonDeals: won.length,
    lostDeals: lost.length,
    openDeals: open.length,
    totalDeals: state.deals.length,
    winRatePct: decided ? (won.length / decided) * 100 : 0,
    avgWonDealSize: won.length ? wonAmount / won.length : 0,
    source: 'dev-preview-state',
    refreshedAt: new Date().toISOString(),
    kpis: {},
    performance,
    territory: [],
    events: state.activities.map((activity) => ({
      id: activity.id,
      type: activity.type === 'EMAIL' ? 'email_sent' : activity.status === 'COMPLETED' ? 'task_completed' : 'deal_moved',
      actor:
        state.users.find((user) => user.id === activity.ownerId)?.firstName ??
        String(activity.ownerId),
      action: String(activity.subject),
      timestamp: 'recently',
    })),
  };
}

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(previewPerformanceReport());
  }

  if (!R) {
    return NextResponse.json(
      {
        error: 'SERVICE_UNAVAILABLE',
        message: 'Reporting service is not configured. Performance reports are not yet available.',
      },
      { status: 503 }
    );
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${R}/api/v1/reports/performance${qs ? `?${qs}` : ''}`, {
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

    const body = (await res.json()) as { data?: unknown } | unknown;
    const data = body && typeof body === 'object' && 'data' in body ? body.data : body;
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
