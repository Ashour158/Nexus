import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      service: 'web',
      timestamp: new Date().toISOString(),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
