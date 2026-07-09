import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest, { params }: { params: { dealId: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const body = await req.text();
  const res = await fetch(`${CRM_SERVICE}/api/v1/deals/${params.dealId}/clone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      'x-tenant-id': tenantId,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
