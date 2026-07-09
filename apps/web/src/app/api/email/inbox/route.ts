import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.EMAIL_SYNC_SERVICE_URL || 'http://localhost:3026';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const dealId = req.nextUrl.searchParams.get('dealId') ?? '';
  const userId = req.headers.get('x-user-id') ?? 'demo-user';

  const res = await fetch(`${BASE}/inbox/${userId}?q=${encodeURIComponent(q)}&dealId=${encodeURIComponent(dealId)}`);
  const data = await res.json().catch(() => []);
  return NextResponse.json(data, { status: res.status });
}
