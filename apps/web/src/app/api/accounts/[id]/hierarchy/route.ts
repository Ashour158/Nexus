import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const account = state.accounts.find((item) => item.id === params.id);
    const children = state.accounts
      .filter((item) => item.parentAccountId === params.id)
      .map((item) => ({ id: item.id, name: item.name, children: [] }));
    return NextResponse.json(apiSuccess({ id: params.id, name: String(account?.name ?? params.id), children }));
  }
  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/hierarchy`, {
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
