import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const body = await req.json();
  const res = await fetch(`${CRM_SERVICE}/api/v1/competitors/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  await fetch(`${CRM_SERVICE}/api/v1/competitors/${params.id}`, {
    method: 'DELETE',
    headers: { 'x-tenant-id': tenantId },
  });
  return new NextResponse(null, { status: 204 });
}
