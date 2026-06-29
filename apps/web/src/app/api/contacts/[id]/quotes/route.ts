import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  getDevPreviewState,
  paginated,
  resolveDevContactIdForCommercialRecord,
} from '@/lib/server/dev-preview-data';

const DEALS_SERVICE_URL = process.env.DEALS_SERVICE_URL || 'http://localhost:3042';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const contact = state.contacts.find((item) => item.id === params.id);
    if (!contact) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    const rows = state.quotes
      .filter((quote) => resolveDevContactIdForCommercialRecord(quote) === params.id)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${DEALS_SERVICE_URL}/api/v1/data/quote-projections/contact/${encodeURIComponent(params.id)}${qs ? `?${qs}` : ''}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
