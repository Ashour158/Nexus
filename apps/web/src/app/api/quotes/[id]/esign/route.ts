import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const rows = getDevPreviewState().quoteESignEnvelopes
      .filter((item) => item.quoteId === params.id)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    return NextResponse.json(apiSuccess(rows));
  }
  const res = await fetch(`${FINANCE_URL}/quotes/${params.id}/esign`, {
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
