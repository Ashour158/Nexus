import { NextRequest, NextResponse } from 'next/server';

const TERRITORY_SERVICE = process.env.TERRITORY_SERVICE_URL || 'http://localhost:3019';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  await fetch(`${TERRITORY_SERVICE}/api/v1/territories/${params.id}`, {
    method: 'DELETE',
    headers: { 'x-tenant-id': tenantId },
  });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const body = await req.json();
  const res = await fetch(`${TERRITORY_SERVICE}/api/v1/territories/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
