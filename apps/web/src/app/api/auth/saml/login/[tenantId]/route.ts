import { NextRequest, NextResponse } from 'next/server';

const AUTH = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const tenantId = params.tenantId;
  const res = await fetch(`${AUTH}/api/v1/auth/saml/login/${tenantId}`, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'x-tenant-id': tenantId },
  });
  const location = res.headers.get('location');
  if (location) return NextResponse.redirect(location);
  return NextResponse.json({ error: 'SSO login redirect failed' }, { status: res.status });
}
