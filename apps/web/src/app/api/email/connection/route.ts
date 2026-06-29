import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.EMAIL_SYNC_SERVICE_URL || 'http://localhost:3026';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id') ?? 'demo-user';
  const res = await fetch(`${BASE}/connection/${userId}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id') ?? 'demo-user';
  const res = await fetch(`${BASE}/connection/${userId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
