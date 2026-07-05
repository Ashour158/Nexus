import { NextRequest, NextResponse } from 'next/server';

const REPORTING_SERVICE = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${REPORTING_SERVICE}/api/v1/reports`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
