import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';
import { addContactDocument, hardenContactRecord } from '@/lib/server/contact-hardening';

const CONTACTS_SERVICE_URL = process.env.CRM_SERVICE_URL || process.env.CONTACTS_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const contact = getDevPreviewState().contacts.find((item) => item.id === params.id);
    if (!contact) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    const hardened = hardenContactRecord(contact);
    return NextResponse.json(apiSuccess(hardened.customFields?.documents ?? []));
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}/attachments`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const index = state.contacts.findIndex((item) => item.id === params.id);
    if (index === -1) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    const actor = String(req.headers.get('x-user-id') ?? state.contacts[index].ownerId ?? 'dev-admin');
    const result = addContactDocument(state.contacts[index], body as Record<string, unknown>, actor);
    if (!result.ok) return NextResponse.json(apiError(result.error, 'BUSINESS_RULE_FAILED'), { status: 422 });
    state.contacts[index] = result.contact;
    return NextResponse.json(apiSuccess(result.contact.customFields?.documents ?? []), { status: 201 });
  }

  const payload = {
    fileName: body.fileName ?? body.name,
    fileSize: body.fileSize ?? body.size ?? 0,
    mimeType: body.mimeType ?? 'application/octet-stream',
    contentBase64: body.contentBase64,
    storageKey: body.storageKey,
  };
  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}/attachments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
