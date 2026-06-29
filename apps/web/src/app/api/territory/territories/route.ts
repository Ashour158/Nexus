import { NextRequest, NextResponse } from 'next/server';

const TERRITORY_SERVICE = process.env.TERRITORY_SERVICE_URL || 'http://localhost:3019';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${TERRITORY_SERVICE}/api/v1/territories`, {
    headers: { 'x-tenant-id': tenantId },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const body = await req.json();
  const res = await fetch(`${TERRITORY_SERVICE}/api/v1/territories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
