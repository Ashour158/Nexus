import { NextRequest, NextResponse } from 'next/server';

const F = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const authorization = req.headers.get('authorization') ?? '';
  const res = await fetch(`${F}/api/v1/invoices/${params.id}/zatca/submit`, {
    method: 'POST',
    headers: {
      'x-tenant-id': tenantId,
      ...(authorization ? { authorization } : {}),
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const authorization = req.headers.get('authorization') ?? '';
  const res = await fetch(`${F}/api/v1/invoices/${params.id}/zatca/status`, {
    headers: {
      'x-tenant-id': tenantId,
      ...(authorization ? { authorization } : {}),
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
