import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const account = getDevPreviewState().accounts.find((item) => item.id === params.id);
    if (!account) return NextResponse.json(apiError('Account not found', 'NOT_FOUND'), { status: 404 });
    const history = account.customFields?.fieldHistory;
    return NextResponse.json(apiSuccess(Array.isArray(history) ? history : []));
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/field-history`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
