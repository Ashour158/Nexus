import { NextResponse } from 'next/server';

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
