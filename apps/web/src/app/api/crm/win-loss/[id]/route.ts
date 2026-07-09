import { NextRequest, NextResponse } from 'next/server';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
    'Content-Type': 'application/json',
  };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.text();
  const res = await fetch(`${C}/api/v1/win-loss-reasons/${params.id}`, {
    method: 'PATCH',
    headers: fwd(req),
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${C}/api/v1/win-loss-reasons/${params.id}`, {
    method: 'DELETE',
    headers: fwd(req),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
