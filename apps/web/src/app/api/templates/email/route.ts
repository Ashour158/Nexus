import { NextRequest, NextResponse } from 'next/server';

const COMM_URL = process.env.COMM_SERVICE_URL || 'http://localhost:3009';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const search = req.nextUrl.searchParams.toString();

  const res = await fetch(`${COMM_URL}/api/v1/templates/email${search ? `?${search}` : ''}`, {
    headers: {
      Authorization: auth,
      'x-tenant-id': tenantId,
    },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
