import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${CRM_SERVICE}/api/v1/enrich/contact/${params.id}`, {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${CRM_SERVICE}/api/v1/enrich/status/contact/${params.id}`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
