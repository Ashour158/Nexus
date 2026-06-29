import { NextRequest, NextResponse } from 'next/server';

const AUTH = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';

export async function PATCH(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const auth = req.headers.get('authorization');
  const headers: Record<string, string> = { 'x-tenant-id': tenantId };
  if (auth) headers.authorization = auth;
  const res = await fetch(`${AUTH}/api/v1/sso/config/toggle`, {
    method: 'PATCH',
    headers,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
