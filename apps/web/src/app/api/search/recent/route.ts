import { NextRequest, NextResponse } from 'next/server';

const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'http://localhost:3006';

// List recent searches for the current user (SRCH-09).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${SEARCH_SERVICE_URL}/api/v1/search/recent${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: auth,
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
