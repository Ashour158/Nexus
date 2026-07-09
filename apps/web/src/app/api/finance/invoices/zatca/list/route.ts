import { NextRequest, NextResponse } from 'next/server';

const F = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${F}/api/v1/zatca/submissions${qs ? `?${qs}` : ''}`, {
    headers: {
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
    },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
