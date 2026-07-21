/**
 * Next.js middleware — server-side route protection.
 *
 * Redirects unauthenticated requests to /login.  The coarse-grained
 * session cookie `nexus_session` is set on successful login and cleared
 * on logout.  Fine-grained authorization still happens at the API layer
 * via the Bearer token this middleware attaches from the HttpOnly
 * `nexus_token` cookie when proxying /api/* (RR-H10).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Transparent access-token refresh (the "BFF session-refresh gap").
 *
 * `api-client` single-flights /api/auth/session/refresh on 401, but ~180 call
 * sites use raw fetch('/bff/...') / fetch('/api/...') and get no such recovery:
 * once the ~15m JWT dies (laptop sleep, throttled tab), every one of them fails
 * until a hard re-login. Middleware is the single choke point that already
 * attaches the Bearer for those paths, so refresh HERE: decode the JWT's exp
 * (no signature check — timing only; the backend still verifies), and when the
 * token is dead but a refresh cookie exists, rotate server-side and attach the
 * fresh Bearer to the same request. Rotation is single-flighted per refresh
 * token because auth-service invalidates a refresh token on first use —
 * concurrent expired requests must share one rotation, not race it.
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

function jwtExpiresWithinSeconds(token: string, seconds: number): boolean {
  try {
    // atob, not Buffer — middleware compiles for the edge runtime.
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 - Date.now() < seconds * 1000;
  } catch {
    return false; // unparsable — attach as-is and let the backend reject it
  }
}

type RotatedPair = { accessToken: string; refreshToken?: string } | null;
const inflightRefresh = new Map<string, Promise<RotatedPair>>();

async function rotateTokens(refreshToken: string): Promise<RotatedPair> {
  const existing = inflightRefresh.get(refreshToken);
  if (existing) return existing;

  const authBase = process.env.AUTH_SERVICE_URL
    ? `${process.env.AUTH_SERVICE_URL}/api/v1`
    : process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3000/api/v1';

  const p = (async (): Promise<RotatedPair> => {
    try {
      const upstream = await fetch(`${authBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      });
      if (!upstream.ok) return null;
      const body = (await upstream.json().catch(() => null)) as {
        data?: { accessToken?: string; refreshToken?: string };
      } | null;
      const accessToken = body?.data?.accessToken;
      if (!accessToken) return null;
      return { accessToken, refreshToken: body?.data?.refreshToken };
    } catch {
      return null;
    } finally {
      // Keep the settled promise briefly so bursts arriving right after
      // settlement still share the result instead of re-rotating.
      setTimeout(() => inflightRefresh.delete(refreshToken), 5000);
    }
  })();

  inflightRefresh.set(refreshToken, p);
  return p;
}

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/health',
  '/version',
  '/bff',
  '/_next',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
];

// Opt-in only — must explicitly set NEXT_PUBLIC_DEV_AUTH_BYPASS=true to enable
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Send the bare root to the executive dashboard in middleware. Rendering the
  // root `/` page segment hits a Next.js standalone-output bug (undefined client
  // reference manifest → "Cannot read properties of undefined (reading
  // 'clientModules'/'entryCSSFiles')") that 500s regardless of page content, so
  // never render it. /dashboard then runs the normal auth check below.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // The Next.js /api/* proxy handlers forward the incoming Authorization header
  // to backend services, but browser calls to /api/* are plain fetch() with no
  // token — the raw JWT lives ONLY in the HttpOnly `nexus_token` cookie
  // (RR-H10), unreadable by client JS. Middleware runs server-side and CAN read
  // that HttpOnly cookie, so we attach the Bearer header here (overriding any
  // optimistic client-set header) — otherwise every
  // reporting/analytics/finance/etc call 401s. This is the BFF's server-side
  // token-attach point: the token never transits through client JavaScript.
  //
  // /bff/* (the next.config rewrite proxies every prod service call rides on)
  // needs the same attach: after a hard reload the in-memory store token is
  // gone by design, and without this every /bff call 401s → the axios
  // interceptor force-logs the user out. Modified request headers propagate
  // through rewrites, so the upstream service receives the Bearer.
  if (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/bff' ||
    pathname.startsWith('/bff/')
  ) {
    const token = request.cookies.get(TOKEN_COOKIE)?.value;
    const refreshCookie = request.cookies.get(REFRESH_COOKIE)?.value;

    // Never intercept the session endpoints themselves — the explicit refresh
    // route must keep working standalone (and must not recurse through here).
    const isSessionRoute = pathname.startsWith('/api/auth/session');

    if (
      !isSessionRoute &&
      refreshCookie &&
      (!token || jwtExpiresWithinSeconds(token, 10))
    ) {
      const rotated = await rotateTokens(refreshCookie);
      if (rotated) {
        const headers = new Headers(request.headers);
        headers.set('authorization', `Bearer ${rotated.accessToken}`);
        const res = NextResponse.next({ request: { headers } });
        res.cookies.set({
          name: TOKEN_COOKIE,
          value: rotated.accessToken,
          ...COOKIE_BASE,
          maxAge: ACCESS_MAX_AGE_SECONDS,
        });
        if (rotated.refreshToken) {
          res.cookies.set({
            name: REFRESH_COOKIE,
            value: rotated.refreshToken,
            ...COOKIE_BASE,
            maxAge: REFRESH_MAX_AGE_SECONDS,
          });
        }
        return res;
      }
      // Rotation failed (revoked/raced) — fall through with whatever we have;
      // the backend's 401 then drives the client's normal logout path.
    }

    if (token) {
      const headers = new Headers(request.headers);
      headers.set('authorization', `Bearer ${token}`);
      return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
  }

  // Allow public assets and API routes unconditionally
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static file extensions
  if (/\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff2?)$/.test(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get('nexus_session');

  if (!session && DEV_AUTH_BYPASS) {
    const response = NextResponse.next();
    response.cookies.set({
      name: 'nexus_session',
      value: 'dev-preview',
      path: '/',
      maxAge: 60 * 60 * 24,
      sameSite: 'lax',
    });
    return response;
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // First-run onboarding — send authenticated users who have neither completed
  // nor yet seen the wizard to /onboarding. Two cookies keep this loop-free:
  //   nexus_onboarded       → wizard finished (set on completion)
  //   nexus_onboarding_seen → wizard visited at least once (set on mount)
  // Once either is present, or the user is already on /onboarding, we never
  // force the redirect again — so "Skip onboarding" (which lands on /dashboard)
  // cannot bounce back into a loop.
  const onboardingDone = request.cookies.get('nexus_onboarded')?.value === '1';
  const onboardingSeen = request.cookies.get('nexus_onboarding_seen')?.value === '1';
  if (!onboardingDone && !onboardingSeen && !pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|css|js|woff2?)$).*)'],
};
