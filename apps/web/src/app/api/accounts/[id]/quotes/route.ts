import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState, paginated } from '@/lib/server/dev-preview-data';

const DEALS_SERVICE_URL = process.env.DEALS_SERVICE_URL || 'http://localhost:3042';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const rows = getDevPreviewState().quotes
      .filter((quote) => quote.accountId === params.id)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${DEALS_SERVICE_URL}/api/v1/data/quote-projections/account/${encodeURIComponent(params.id)}${qs ? `?${qs}` : ''}`, {
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
