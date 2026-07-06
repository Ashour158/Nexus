import { NextRequest, NextResponse } from 'next/server';

/**
 * BFF auth-forward proxy for notification preferences (NOT-11).
 *
 * Forwards the caller's bearer token + tenant header straight through to
 * notification-service, which derives tenant/user from the JWT. The browser
 * never talks to :3003 directly (dev) and the token is passed opaque.
 */

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003';

const TARGET = `${NOTIFICATION_SERVICE_URL}/api/v1/notifications/preferences`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const res = await fetch(TARGET, {
    headers: {
      authorization: auth,
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(TARGET, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth,
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
