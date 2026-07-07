import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';
import { getContactTimeline, hardenContactRecord } from '@/lib/server/contact-hardening';

const CONTACTS_SERVICE_URL = process.env.CRM_SERVICE_URL || process.env.CONTACTS_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const contact = state.contacts.find((item) => item.id === params.id);
    if (!contact) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    const events = getContactTimeline(hardenContactRecord(contact), state.activities, {
      quotes: state.quotes,
      rfqs: state.rfqs,
    });
    return NextResponse.json(apiSuccess({ events, nextCursor: null }));
  }

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}/timeline${qs ? `?${qs}` : ''}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
