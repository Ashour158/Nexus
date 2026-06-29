import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';
import { restoreContact } from '@/lib/server/contact-hardening';

const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || process.env.CRM_SERVICE_URL || 'http://localhost:3041';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const index = state.contacts.findIndex((item) => item.id === params.id);
    if (index === -1) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    const actor = String(req.headers.get('x-user-id') ?? state.contacts[index].ownerId ?? 'dev-admin');
    const result = restoreContact(state.contacts[index], actor);
    if (!result.ok) return NextResponse.json(apiError(result.error, 'BUSINESS_RULE_FAILED'), { status: 422 });
    state.contacts[index] = result.contact;
    return NextResponse.json(apiSuccess(result.contact));
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}/restore`, {
    method: 'POST',
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
