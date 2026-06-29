import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState, paginated } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    let rows = getDevPreviewState().contacts.filter((contact) => contact.accountId === params.id);
    const q = req.nextUrl.searchParams.get('search')?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((contact) =>
        [contact.firstName, contact.lastName, contact.email, contact.jobTitle].filter(Boolean).join(' ').toLowerCase().includes(q)
      );
    }
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/contacts${qs ? `?${qs}` : ''}`, {
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
