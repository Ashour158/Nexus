import { NextRequest, NextResponse } from 'next/server';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
  };
}

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${R}/api/v1/analytics/snapshots${qs ? `?${qs}` : ''}`, {
    headers: fwd(req),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
