import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const CONTACTS_SERVICE_URL = process.env.CRM_SERVICE_URL || process.env.CONTACTS_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const contact = getDevPreviewState().contacts.find((item) => item.id === params.id);
    if (!contact) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    return NextResponse.json(
      apiSuccess([
        {
          channel: 'Email',
          granted: Boolean(contact.gdprConsent && !contact.doNotEmail),
          updatedAt: String(contact.gdprConsentAt ?? contact.updatedAt),
        },
        {
          channel: 'Phone',
          granted: Boolean(contact.gdprConsent && !contact.doNotCall),
          updatedAt: String(contact.gdprConsentAt ?? contact.updatedAt),
        },
        {
          channel: 'WhatsApp',
          granted: Boolean(contact.gdprConsent),
          updatedAt: String(contact.gdprConsentAt ?? contact.updatedAt),
        },
      ])
    );
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}/consents`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
