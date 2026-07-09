import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.EMAIL_SYNC_SERVICE_URL || 'http://localhost:3026';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.headers.get('x-user-id') ?? 'demo-user';
  const res = await fetch(`${BASE}/threads/${userId}/${params.id}`);
  const data = await res.json().catch(() => []);
  return NextResponse.json(data, { status: res.status });
}
