import { NextResponse } from 'next/server';

// Must read the RUNTIME env — without this Next statically prerenders the
// handler at build time and bakes in "unknown" forever.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      service: 'web',
      gitSha: process.env.GIT_SHA?.trim() || 'unknown',
      builtAt: process.env.BUILT_AT?.trim() || 'unknown',
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
