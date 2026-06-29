import { NextRequest, NextResponse } from 'next/server';

const CRM = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const authorization = req.headers.get('authorization') ?? '';
  const res = await fetch(`${CRM}/api/v1/contacts/${params.id}/consents`, {
    headers: {
      'x-tenant-id': tenantId,
      ...(authorization ? { authorization } : {}),
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const authorization = req.headers.get('authorization') ?? '';
  const res = await fetch(`${CRM}/api/v1/contacts/${params.id}/consents`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(await req.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
