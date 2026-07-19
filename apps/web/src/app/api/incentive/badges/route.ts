import { NextRequest, NextResponse } from 'next/server';

const INCENTIVE_SERVICE = process.env.INCENTIVE_SERVICE_URL || 'http://localhost:3024';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  // "Your Badges" must use the current-user projection; the tenant-wide route
  // includes awards belonging to other users.
  const res = await fetch(`${INCENTIVE_SERVICE}/api/v1/badges/mine`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
