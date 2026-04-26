import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [
      { id: 'c1', name: 'John Smith', consent: 'GRANTED', updatedAt: '2026-04-10T00:00:00.000Z', audit: 'Updated by import' },
      { id: 'c2', name: 'Sara Lee', consent: 'REVOKED', updatedAt: '2026-04-22T00:00:00.000Z', audit: 'Updated manually' },
    ],
  });
}
