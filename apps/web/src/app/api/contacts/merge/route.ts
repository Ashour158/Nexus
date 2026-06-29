import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';
import { mergeContacts } from '@/lib/server/contact-hardening';

const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || process.env.CRM_SERVICE_URL || 'http://localhost:3041';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (DEV_PREVIEW_ENABLED) {
    const actor = String(req.headers.get('x-user-id') ?? 'dev-admin');
    const result = mergeContacts(
      getDevPreviewState(),
      String(body.masterContactId ?? ''),
      String(body.duplicateContactId ?? ''),
      actor
    );
    if (!result.ok) return NextResponse.json(apiError(result.error, 'MERGE_FAILED'), { status: 422 });
    return NextResponse.json(apiSuccess(result.contact));
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/merge`, {
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
