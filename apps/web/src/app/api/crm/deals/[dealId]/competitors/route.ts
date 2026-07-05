import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { dealId: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${CRM_SERVICE}/api/v1/deals/${params.dealId}/competitors`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest, { params }: { params: { dealId: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const body = await req.json();
  const res = await fetch(`${CRM_SERVICE}/api/v1/deals/${params.dealId}/competitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
