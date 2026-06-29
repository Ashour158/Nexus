/**
 * Next.js middleware — server-side route protection.
 *
 * Redirects unauthenticated requests to /login.  The coarse-grained
 * session cookie `nexus_session` is set on successful login and cleared
 * on logout.  Fine-grained authorization still happens at the API layer
 * via the Bearer token attached by api-client.ts.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api',
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|css|js|woff2?)$).*)'],
};
