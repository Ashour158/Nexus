import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const base = process.env.PLANNING_SERVICE_URL;

  if (!base) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(`${base}/api/v1/deals/forecast`, {
      headers: auth ? { Authorization: auth } : undefined,
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : data.data ?? []);
  } catch {
    return NextResponse.json([]);
  }
}
