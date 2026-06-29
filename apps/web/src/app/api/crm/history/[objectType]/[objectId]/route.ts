import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';

export async function GET(
  req: NextRequest,
  { params }: { params: { objectType: string; objectId: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const qs = req.nextUrl.searchParams.toString();
  const path = `${CRM_SERVICE}/api/v1/history/${params.objectType}/${params.objectId}`;
  const url = qs ? `${path}?${qs}` : path;
  const res = await fetch(url, {
    headers: {
      Authorization: auth,
      'x-tenant-id': tenantId,
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
