import { NextRequest, NextResponse } from 'next/server';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${R}/api/v1/analytics/snapshots/take`, {
    method: 'POST',
    headers: {
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
      'Content-Type': 'application/json',
    },
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
