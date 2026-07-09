import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const activity = state.activities.find((item) => item.id === params.id);
    if (!activity) return NextResponse.json(apiError('Activity not found'), { status: 404 });

    const completedAt = new Date().toISOString();
    activity.status = 'COMPLETED';
    activity.completedAt = completedAt;
    activity.outcome = typeof body.outcome === 'string' ? body.outcome : 'Completed';
    activity.updatedAt = completedAt;

    return NextResponse.json(apiSuccess(activity));
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/activities/${params.id}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
