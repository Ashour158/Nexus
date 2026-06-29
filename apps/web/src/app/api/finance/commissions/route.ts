import { NextRequest, NextResponse } from 'next/server';

const FINANCE_SERVICE = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(req.url);
  const res = await fetch(`${FINANCE_SERVICE}/api/v1/commissions?${searchParams.toString()}`, {
    headers: { 'x-tenant-id': tenantId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
