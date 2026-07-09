import { NextRequest, NextResponse } from 'next/server';

const PLANNING_SERVICE = process.env.PLANNING_SERVICE_URL || 'http://localhost:3020';

function forwardHeaders(req: NextRequest): HeadersInit {
  const auth = req.headers.get('authorization');
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const h: Record<string, string> = { 'x-tenant-id': tenantId };
  if (auth) h.Authorization = auth;
  return h;
}

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${PLANNING_SERVICE}/api/v1/forecast-overrides?${qs}`, {
    headers: forwardHeaders(req),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PUT(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${PLANNING_SERVICE}/api/v1/forecast-overrides`, {
    method: 'PUT',
    headers: {
      ...forwardHeaders(req),
      'Content-Type': 'application/json',
    },
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
