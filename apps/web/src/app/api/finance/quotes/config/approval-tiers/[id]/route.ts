import { NextRequest, NextResponse } from 'next/server';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${FINANCE_URL}/quotes/config/approval-tiers/${params.id}`, {
    method: 'DELETE',
    headers: {
      authorization: req.headers.get('authorization') ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
