import { NextRequest, NextResponse } from 'next/server';

const PLANNING_SERVICE = process.env.PLANNING_SERVICE_URL || 'http://localhost:3020';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(req.url);
  const res = await fetch(`${PLANNING_SERVICE}/api/v1/quotas?${searchParams.toString()}`, {
    headers: { 'x-tenant-id': tenantId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
