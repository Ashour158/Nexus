import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${CRM_SERVICE}/api/v1/account-health${qs ? `?${qs}` : ''}`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
