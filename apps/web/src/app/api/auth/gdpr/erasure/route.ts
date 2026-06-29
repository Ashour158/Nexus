import { NextRequest, NextResponse } from 'next/server';

const AUTH = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const auth = req.headers.get('authorization');
  const body = await req.json();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
  };
  if (auth) headers.authorization = auth;

  const res = await fetch(`${AUTH}/api/v1/gdpr/erasure`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const auth = req.headers.get('authorization');
  const headers: Record<string, string> = { 'x-tenant-id': tenantId };
  if (auth) headers.authorization = auth;
  const res = await fetch(`${AUTH}/api/v1/gdpr/erasure`, { headers });
  return NextResponse.json(await res.json(), { status: res.status });
}
