import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.EMAIL_SYNC_SERVICE_URL || 'http://localhost:3026';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id') ?? 'demo-user';
  try {
    const res = await fetch(`${BASE}/connection/${userId}`, {
      headers: { authorization: req.headers.get('authorization') ?? '' },
    });
    if (!res.ok) {
      // No linked mailbox (or the sync service rejected the lookup) is a normal
      // state for the inbox, not an error — return an unconnected payload so the
      // page renders its connect-CTA instead of an error banner.
      return NextResponse.json({ connected: false, provider: null, email: null });
    }
    const data = await res.json().catch(() => ({ connected: false }));
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ connected: false, provider: null, email: null });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id') ?? 'demo-user';
  const res = await fetch(`${BASE}/connection/${userId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
