import { NextRequest, NextResponse } from 'next/server';

const DOCUMENT_SERVICE_URL = process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:3016';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const res = await fetch(`${DOCUMENT_SERVICE_URL}/api/v1/documents/esign/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
