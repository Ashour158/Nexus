import { NextRequest, NextResponse } from 'next/server';

const AUTH_URL = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3010/api/v1';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { query?: string };
  if (!body.query?.trim()) {
    return NextResponse.json({ success: false, error: 'query is required' }, { status: 400 });
  }

  const auth = req.headers.get('authorization') ?? '';

  try {
    const res = await fetch(`${AUTH_URL}/privacy/erasure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Privacy erasure service is not available.' },
      { status: 503 }
    );
  }
}
