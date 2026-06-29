import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const auth = req.headers.get('authorization');
  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || 'this_quarter';
  const h: Record<string, string> = { 'x-tenant-id': tenantId };
  if (auth) h.Authorization = auth;
  const res = await fetch(`${CRM_SERVICE}/api/v1/forecast?period=${period}`, {
    headers: h,
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}