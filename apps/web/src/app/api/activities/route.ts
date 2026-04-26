import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const type = req.nextUrl.searchParams.get('type') ?? 'all';
  const userId = req.headers.get('x-user-id') ?? '';

  const res = await fetch(`${process.env.CRM_SERVICE_URL}/activities?type=${type}&userId=${userId}`, {
    headers: { Authorization: auth },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
