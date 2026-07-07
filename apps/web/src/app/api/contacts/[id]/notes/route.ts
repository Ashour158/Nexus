import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, paginated } from '@/lib/server/dev-preview-data';

const CONTACTS_SERVICE_URL = process.env.CRM_SERVICE_URL || process.env.CONTACTS_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(paginated([], req.nextUrl.searchParams)));
  }

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}/notes${qs ? `?${qs}` : ''}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
