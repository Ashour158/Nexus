import { NextRequest, NextResponse } from 'next/server';

const PLANNING_SERVICE = process.env.PLANNING_SERVICE_URL || 'http://localhost:3020';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(req.url);
  const res = await fetch(`${PLANNING_SERVICE}/api/v1/quotas/plans?${searchParams.toString()}`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
