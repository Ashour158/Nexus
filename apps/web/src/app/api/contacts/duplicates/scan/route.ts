import { NextRequest, NextResponse } from 'next/server';

const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || process.env.CRM_SERVICE_URL || 'http://localhost:3041';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts/duplicates/scan`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tenantId }),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
