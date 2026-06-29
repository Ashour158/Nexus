import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const entityType = req.nextUrl.searchParams.get('entityType') ?? 'contact';
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const auth = req.headers.get('authorization') ?? '';

  const res = await fetch(
    `${process.env.CRM_SERVICE_URL}/api/v1/custom-fields?entityType=${encodeURIComponent(entityType)}&tenantId=${encodeURIComponent(tenantId)}`,
    { headers: auth ? { Authorization: auth } : undefined }
  );
  const data = await res.json().catch(() => []);
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  const body = await req.json();
  const res = await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/custom-fields`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({ ...body, tenantId }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
