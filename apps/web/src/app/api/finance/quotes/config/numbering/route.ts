import { NextRequest, NextResponse } from 'next/server';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

function fwd(req: NextRequest): HeadersInit {
  return {
    'Content-Type': 'application/json',
    authorization: req.headers.get('authorization') ?? '',
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
  };
}

export async function GET(req: NextRequest) {
  const res = await fetch(`${FINANCE_URL}/quotes/config/numbering`, { headers: fwd(req), cache: 'no-store' });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function PUT(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${FINANCE_URL}/quotes/config/numbering`, { method: 'PUT', headers: fwd(req), body });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
