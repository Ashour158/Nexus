import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function forwardHeaders(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') || 'default',
    authorization: req.headers.get('authorization') ?? '',
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { dealId: string; itemId: string } }
) {
  const body = await req.json();
  const res = await fetch(
    `${CRM_SERVICE}/api/v1/deals/${params.dealId}/room/items/${params.itemId}`,
    {
      method: 'PATCH',
      headers: { ...forwardHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { dealId: string; itemId: string } }
) {
  const res = await fetch(
    `${CRM_SERVICE}/api/v1/deals/${params.dealId}/room/items/${params.itemId}`,
    { method: 'DELETE', headers: forwardHeaders(req) }
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
