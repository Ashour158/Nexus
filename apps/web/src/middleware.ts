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

const PUBLIC_PATHS = [
  '/login',
  '/bff',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/offline.html',
];

// Opt-in only — must explicitly set NEXT_PUBLIC_DEV_AUTH_BYPASS=true to enable
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

export function middleware(request: NextRequest) {
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
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const token = request.cookies.get('nexus_token')?.value;
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
