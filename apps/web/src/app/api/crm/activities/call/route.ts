import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const body = await req.json();
  const res = await fetch(`${CRM_SERVICE}/api/v1/activities/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const res = await fetch(`${CRM_SERVICE}/api/v1/activities/calls${qs ? `?${qs}` : ''}`, {
    headers: { 'x-tenant-id': tenantId },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
