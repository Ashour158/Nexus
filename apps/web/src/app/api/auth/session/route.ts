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
const REFRESH_COOKIE = 'nexus_refresh';
/**
 * Access-token cookie lifetime. The JWT inside expires in ~15m (JWT_EXPIRY), so
 * this cookie must NOT outlive it by much: a long-lived cookie wrapping a dead
 * JWT is exactly the failure mode that made every authenticated call fail ~15
 * minutes into a session while the user still appeared signed in. We keep a
 * small grace margin so a request in flight at the boundary can still be
 * refreshed, and `/api/auth/session/refresh` re-issues both cookies.
 */
const ACCESS_MAX_AGE_SECONDS = 60 * 20; // 20m — 15m token + grace
/** Refresh token lives as long as the server-side session (REFRESH_TOKEN_EXPIRY, default 7d). */
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Shared cookie attributes. `secure` is disabled in dev so http://localhost works. */
const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

export async function POST(req: NextRequest) {
  let accessToken: unknown;
  let refreshToken: unknown;
  try {
    ({ accessToken, refreshToken } = (await req.json()) as {
      accessToken?: unknown;
      refreshToken?: unknown;
    });
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
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });
  // The refresh token is what lets `/api/auth/session/refresh` mint a new access
  // token once the short-lived one expires. It is equally secret, so it gets the
  // same HttpOnly/Secure/SameSite treatment and is never exposed to client JS.
  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    res.cookies.set({
      name: REFRESH_COOKIE,
      value: refreshToken,
      ...COOKIE_BASE,
      maxAge: REFRESH_MAX_AGE_SECONDS,
    });
  }
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  // Expire BOTH HttpOnly cookies server-side (client JS cannot clear them).
  for (const name of [TOKEN_COOKIE, REFRESH_COOKIE]) {
    res.cookies.set({ name, value: '', ...COOKIE_BASE, maxAge: 0 });
  }
  return res;
}
