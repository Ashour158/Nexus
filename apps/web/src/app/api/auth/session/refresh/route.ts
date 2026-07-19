import { NextRequest, NextResponse } from 'next/server';

/**
 * Cookie-backed access-token refresh.
 *
 * WHY THIS EXISTS: the access token in `nexus_token` expires after ~15 minutes
 * (JWT_EXPIRY), but the browser only ever held it in an HttpOnly cookie and the
 * in-memory refresh token is deliberately not persisted. So once the JWT aged
 * out, middleware kept attaching a DEAD Bearer to every `/api/*` and `/bff/*`
 * request while the user still looked signed in — every business API failed at
 * once, roughly 15 minutes into a session, with no way to recover short of a
 * fresh login. This handler closes that loop entirely server-side.
 *
 * It reads the HttpOnly `nexus_refresh` cookie, exchanges it at the auth
 * service, and writes the rotated pair back as cookies. The raw tokens never
 * enter client JS — the caller only learns whether the refresh worked.
 *
 * Refresh tokens ROTATE (auth-service invalidates the old one), so callers must
 * treat this as single-flight: concurrent calls will race and all but one will
 * get 401. `api-client` serialises them behind one in-flight promise.
 */

const TOKEN_COOKIE = 'nexus_token';
const REFRESH_COOKIE = 'nexus_refresh';
const ACCESS_MAX_AGE_SECONDS = 60 * 20;
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

/** Server-side auth base — never the browser-relative NEXT_PUBLIC value. */
function authBase(): string {
  return process.env.AUTH_SERVICE_URL
    ? `${process.env.AUTH_SERVICE_URL}/api/v1`
    : process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3000/api/v1';
}

/** Clear both session cookies so the client stops retrying with dead credentials. */
function clearedResponse(status: number, error: string) {
  const res = NextResponse.json({ success: false, error }, { status });
  for (const name of [TOKEN_COOKIE, REFRESH_COOKIE]) {
    res.cookies.set({ name, value: '', ...COOKIE_BASE, maxAge: 0 });
  }
  return res;
}

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    // No refresh material — the session cannot be revived. Clear so the app
    // redirects to login instead of looping on failed calls.
    return clearedResponse(401, 'No refresh token');
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${authBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
  } catch {
    // Transient upstream/network problem — do NOT clear cookies; the existing
    // refresh token may still be valid on the next attempt.
    return NextResponse.json(
      { success: false, error: 'Auth service unreachable' },
      { status: 503 }
    );
  }

  if (!upstream.ok) {
    // Refresh token rejected (expired, revoked, or already rotated by a
    // concurrent refresh). The session is genuinely over.
    return clearedResponse(401, 'Refresh rejected');
  }

  const body = (await upstream.json().catch(() => null)) as
    | { data?: { accessToken?: string; refreshToken?: string; expiresIn?: string } }
    | null;
  const accessToken = body?.data?.accessToken;
  const nextRefresh = body?.data?.refreshToken;
  if (!accessToken) {
    return clearedResponse(401, 'Malformed refresh response');
  }

  const res = NextResponse.json({ success: true, expiresIn: body?.data?.expiresIn ?? null });
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: accessToken,
    ...COOKIE_BASE,
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });
  if (nextRefresh) {
    res.cookies.set({
      name: REFRESH_COOKIE,
      value: nextRefresh,
      ...COOKIE_BASE,
      maxAge: REFRESH_MAX_AGE_SECONDS,
    });
  }
  return res;
}
