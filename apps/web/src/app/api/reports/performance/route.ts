import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

const R = process.env.REPORTING_SERVICE_URL;

function previewPerformanceReport() {
  const state = getDevPreviewState();
  const performance = state.deals.map((deal, index) => {
    const owner = state.users.find((user) => user.id === deal.ownerId);
    const ownerName = owner ? `${owner.firstName} ${owner.lastName}` : String(deal.ownerId);
    const status =
      deal.status === 'WON'
        ? 'CLOSED WON'
        : deal.status === 'LOST'
          ? 'CLOSED LOST'
          : index % 3 === 0
            ? 'PENDING APPROVAL'
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

  return {
    kpis: {
      revenueDelta: 12.8,
      conversionDelta: 4.3,
      activeDealsDelta: 9.1,
      avgDealSizeDelta: 6.4,
      revenueSparkline: [98000, 112000, 125000, 134000, 148000, 161000],
      conversionSparkline: [18, 21, 22, 24, 26, 29],
      activeDealsSparkline: [11, 13, 12, 16, 18, 19],
      avgDealSizeSparkline: [42000, 47000, 51000, 53000, 56000, 59000],
    },
    performance,
    territory: [
      { name: 'MEA Enterprise', value: 214000, delta: 13 },
      { name: 'GCC Strategic', value: 132000, delta: 9 },
      { name: 'Egypt Midmarket', value: 76000, delta: 7 },
    ],
    events: state.activities.map((activity) => ({
      id: activity.id,
      type: activity.type === 'EMAIL' ? 'email_sent' : activity.status === 'COMPLETED' ? 'task_completed' : 'deal_moved',
      actor:
        state.users.find((user) => user.id === activity.ownerId)?.firstName ??
        String(activity.ownerId),
      action: String(activity.subject),
      timestamp: 'recently',
    })),
    reps: [
      { id: 'sara-manager', name: 'Sara Manager', revenue: 285000, quota: 320000, won: 2, activities: 42, responseHrs: 2.1 },
      { id: 'dev-admin', name: 'Dev Admin', revenue: 132000, quota: 180000, won: 1, activities: 28, responseHrs: 3.4 },
      { id: 'mona-rep', name: 'Mona Farouk', revenue: 94000, quota: 150000, won: 1, activities: 35, responseHrs: 4.8 },
    ],
    activity: [
      { type: 'Calls', count: 34 },
      { type: 'Emails', count: 72 },
      { type: 'Meetings', count: 18 },
      { type: 'Demos', count: 11 },
    ],
    cumulative: [
      { month: 'Jan', revenue: 82000, quota: 90000 },
      { month: 'Feb', revenue: 138000, quota: 150000 },
      { month: 'Mar', revenue: 221000, quota: 235000 },
      { month: 'Apr', revenue: 298000, quota: 320000 },
      { month: 'May', revenue: 417000, quota: 450000 },
    ],
    lostReasons: [
      { reason: 'Price', count: 3 },
      { reason: 'Timeline', count: 2 },
      { reason: 'Feature gap', count: 1 },
    ],
    competitors: [
      { name: 'Salesforce', mentions: 5 },
      { name: 'HubSpot', mentions: 4 },
      { name: 'Zoho CRM', mentions: 3 },
    ],
    winLoss: [
      { name: 'Won', value: 3 },
      { name: 'Lost', value: 2 },
      { name: 'Open', value: 8 },
    ],
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
