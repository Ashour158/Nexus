import { NextRequest, NextResponse } from 'next/server';

/**
 * BFF session-cookie endpoint (RR-H10).
 *
 * The raw access-token JWT must NEVER be readable by client JavaScript — a
 * JS-readable cookie (`document.cookie`) or web-storage copy is directly
 * exfiltratable by any XSS. Instead, the browser POSTs the freshly-minted token
 * here (same-origin) and this server-side handler stores it in an **HttpOnly,
 * Secure, SameSite=Strict** cookie via `Set-Cookie`. The token is then only
 * ever seen server-side:
 *   - `middleware.ts` reads this HttpOnly cookie and attaches
 *     `Authorization: Bearer <token>` when proxying `/api/*` to backend services.
 *   - client JS never holds the raw token.
 *
 * Follow-up (deferred): full refresh-token rotation — mint short-lived access
 * tokens and rotate a separate HttpOnly refresh cookie via a server-side
 * `/api/auth/session/refresh` handler, so a stolen access token has a small
 * blast radius. Today the access token itself lives in this cookie for its
 * natural lifetime.
 */

const TOKEN_COOKIE = 'nexus_token';
const MAX_AGE_SECONDS = 60 * 60 * 24; // 24h — matches the previous cookie lifetime.

/** Shared cookie attributes. `secure` is disabled in dev so http://localhost works. */
const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

export async function POST(req: NextRequest) {
  let accessToken: unknown;
  try {
    ({ accessToken } = (await req.json()) as { accessToken?: unknown });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return NextResponse.json(
      { success: false, error: 'accessToken is required' },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: accessToken,
    ...COOKIE_BASE,
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  // Expire the HttpOnly token cookie server-side (client JS cannot clear it).
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: '',
    ...COOKIE_BASE,
    maxAge: 0,
  });
  return res;
}
