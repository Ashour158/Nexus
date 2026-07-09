import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const authorization = req.headers.get('authorization') ?? '';
  const res = await fetch(`${CRM_SERVICE}/api/v1/accounts/${params.id}/hierarchy`, {
    headers: { 'x-tenant-id': tenantId, authorization },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
