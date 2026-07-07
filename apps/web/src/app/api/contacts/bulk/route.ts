import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';
import { applyContactGovernedPatch, archiveContact, restoreContact } from '@/lib/server/contact-hardening';

const CONTACTS_SERVICE_URL = process.env.CRM_SERVICE_URL || process.env.CONTACTS_SERVICE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const actor = String(req.headers.get('x-user-id') ?? 'dev-admin');
    const updated: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      const index = state.contacts.findIndex((contact) => contact.id === id);
      if (index === -1) {
        errors.push({ id, error: 'Contact not found' });
        continue;
      }

      const action = String(body.action ?? '');
      const existingTags = Array.isArray(state.contacts[index].tags)
        ? state.contacts[index].tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      const incomingTags = Array.isArray(body.tags) ? body.tags.map(String) : [];
      const result =
        action === 'archive'
          ? archiveContact(state.contacts[index], actor, String(body.reason ?? 'Bulk archive'))
          : action === 'restore'
            ? restoreContact(state.contacts[index], actor)
            : applyContactGovernedPatch(
                state.contacts[index],
                {
                  ...(body.ownerId ? { ownerId: String(body.ownerId) } : {}),
                  ...(Array.isArray(body.tags)
                    ? { tags: Array.from(new Set([...existingTags, ...incomingTags])) }
                    : {}),
                },
                actor,
                'Bulk contact update'
              );

      if (!result.ok) {
        errors.push({ id, error: result.error });
        continue;
      }
      state.contacts[index] = result.contact;
      updated.push(id);
    }

    return NextResponse.json(apiSuccess({ updated, errors }));
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
