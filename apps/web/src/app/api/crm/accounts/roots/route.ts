import { NextRequest, NextResponse } from 'next/server';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${C}/api/v1/accounts/roots${qs ? `?${qs}` : ''}`, {
    headers: {
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
    },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
