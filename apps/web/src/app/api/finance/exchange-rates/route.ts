import { NextRequest, NextResponse } from 'next/server';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await fetch(`${FINANCE_URL}/exchange-rates`, {
    headers: { Authorization: auth },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.text();
  const res = await fetch(`${FINANCE_URL}/exchange-rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

