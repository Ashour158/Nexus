import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { accountId: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${CRM_SERVICE}/api/v1/account-health/${params.accountId}`, {
    headers: { 'x-tenant-id': tenantId },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
