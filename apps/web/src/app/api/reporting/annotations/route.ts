import { NextRequest, NextResponse } from 'next/server';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
    'Content-Type': 'application/json',
  };
}

export async function GET(req: NextRequest) {
  const res = await fetch(`${R}/api/v1/annotations${req.nextUrl.search}`, {
    headers: fwd(req),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${R}/api/v1/annotations`, { method: 'POST', headers: fwd(req), body });
  return NextResponse.json(await res.json(), { status: res.status });
}
