import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.EMAIL_SYNC_SERVICE_URL || 'http://localhost:3026';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id') ?? 'demo-user';
  const payload = await req.json();

  const res = await fetch(`${BASE}/send/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
