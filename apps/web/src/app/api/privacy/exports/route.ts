import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [
      { id: 'ex-1', requestedAt: '2026-04-20T10:00:00.000Z', status: 'READY', expiresAt: '2026-04-21T10:00:00.000Z' },
      { id: 'ex-2', requestedAt: '2026-03-18T09:00:00.000Z', status: 'READY', expiresAt: '2026-03-19T09:00:00.000Z' },
    ],
  });
}

export async function POST() {
  return NextResponse.json(
    {
      success: true,
      data: {
        id: `ex-${Date.now()}`,
        requestedAt: new Date().toISOString(),
        status: 'PROCESSING',
      },
    },
    { status: 201 }
  );
}
