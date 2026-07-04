import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState, paginated } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

/**
 * Account journey timeline. Proxies to crm-service `GET /accounts/:id/timeline`
 * (a merged, paginated `TimelineEvent[]` of activities and notes). In dev
 * preview it synthesizes the same shape from the mocked activity store.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const rows = state.activities
      .filter((activity) => activity.accountId === params.id)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .map((activity) => ({
        id: `activity:${activity.id}`,
        type: 'ACTIVITY',
        at: activity.createdAt,
        title: `${activity.type}: ${activity.subject}`,
        description: (activity.description as string | undefined) ?? undefined,
        actorId: activity.ownerId,
        metadata: { status: activity.status },
      }));
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }

  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(
    `${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/timeline${search ? `?${search}` : ''}`,
    {
      headers: {
        authorization: auth ?? '',
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      },
      cache: 'no-store',
    }
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
