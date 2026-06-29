import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState, validateDevObject } from '@/lib/server/dev-preview-data';
import {
  applyContactGovernedPatch,
  archiveContact,
  findDuplicateContacts,
  hardenContactRecord,
} from '@/lib/server/contact-hardening';

const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || process.env.CRM_SERVICE_URL || 'http://localhost:3041';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const contact = getDevPreviewState().contacts.find((item) => item.id === params.id);
    if (!contact) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    return NextResponse.json(apiSuccess(hardenContactRecord(contact)));
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const index = state.contacts.findIndex((item) => item.id === params.id);
    if (index === -1) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    const merged = { ...state.contacts[index], ...body };
    const validation = validateDevObject('contact', merged as Record<string, unknown>);
    if (!validation.valid) {
      return NextResponse.json(
        apiError(Object.values(validation.errors)[0] ?? 'Contact validation failed', 'VALIDATION_FAILED'),
        { status: 422 }
      );
    }

    const duplicate = findDuplicateContacts(state.contacts, merged as Record<string, unknown>, params.id)[0];
    if (duplicate) {
      return NextResponse.json(
        {
          ...apiError(
            `Possible duplicate contact: ${duplicate.firstName} ${duplicate.lastName}`,
            'DUPLICATE_CONTACT'
          ),
          duplicate,
        },
        { status: 409 }
      );
    }

    const actor = String(req.headers.get('x-user-id') ?? body.ownerId ?? state.contacts[index].ownerId ?? 'dev-admin');
    const result = applyContactGovernedPatch(state.contacts[index], body as Record<string, unknown>, actor);
    if (!result.ok) return NextResponse.json(apiError(result.error, 'BUSINESS_RULE_FAILED'), { status: 422 });

    state.contacts[index] = result.contact;
    return NextResponse.json(apiSuccess(state.contacts[index]));
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const index = state.contacts.findIndex((item) => item.id === params.id);
    if (index === -1) return NextResponse.json(apiError('Contact not found', 'NOT_FOUND'), { status: 404 });
    const actor = String(req.headers.get('x-user-id') ?? state.contacts[index].ownerId ?? 'dev-admin');
    const result = archiveContact(state.contacts[index], actor, 'Deleted from contact record');
    if (!result.ok) return NextResponse.json(apiError(result.error, 'BUSINESS_RULE_FAILED'), { status: 422 });
    state.contacts[index] = result.contact;
    return NextResponse.json(apiSuccess({ id: params.id, archived: true, contact: result.contact }));
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/${params.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
