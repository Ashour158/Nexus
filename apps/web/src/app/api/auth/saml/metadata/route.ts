import { NextRequest, NextResponse } from 'next/server';

const AUTH = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${AUTH}/api/v1/auth/saml/metadata?tenant=${encodeURIComponent(tenantId)}`, {
    headers: { 'x-tenant-id': tenantId },
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/xml' },
  });
}
