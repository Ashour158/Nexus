import { NextRequest, NextResponse } from 'next/server';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
    'Content-Type': 'application/json',
  };
}

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${C}/api/v1/win-loss-reasons${qs ? `?${qs}` : ''}`, {
    headers: fwd(req),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${C}/api/v1/win-loss-reasons`, {
    method: 'POST',
    headers: fwd(req),
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
