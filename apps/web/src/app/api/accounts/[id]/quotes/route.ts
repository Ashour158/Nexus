import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState, paginated } from '@/lib/server/dev-preview-data';

// Quotes live in finance-service, keyed by accountId — NOT in a deals/crm
// quote-projection read-model (that route doesn't exist and 404'd the default
// tab of every account 360).
const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const rows = getDevPreviewState().quotes
      .filter((quote) => quote.accountId === params.id)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }
  const sp = new URLSearchParams(req.nextUrl.searchParams);
  sp.set('accountId', params.id);
  const res = await fetch(`${FINANCE_URL}/quotes?${sp.toString()}`, {
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
