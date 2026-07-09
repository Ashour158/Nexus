import { NextRequest, NextResponse } from 'next/server';

const AUTH_URL = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3010/api/v1';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';

  try {
    const res = await fetch(`${AUTH_URL}/privacy/exports`, {
      headers: { Authorization: auth },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upstream error' }));
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Privacy exports service is not available.' },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const body = await req.text();

  try {
    const res = await fetch(`${AUTH_URL}/privacy/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body,
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Privacy exports service is not available.' },
      { status: 503 }
    );
  }
}
