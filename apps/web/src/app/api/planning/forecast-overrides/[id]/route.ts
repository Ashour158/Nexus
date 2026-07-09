import { NextRequest, NextResponse } from 'next/server';

const PLANNING_SERVICE = process.env.PLANNING_SERVICE_URL || 'http://localhost:3020';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const res = await fetch(`${PLANNING_SERVICE}/api/v1/forecast-overrides/${params.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: auth,
      'x-tenant-id': tenantId,
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
