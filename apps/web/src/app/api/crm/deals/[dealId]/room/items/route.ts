import { NextRequest, NextResponse } from 'next/server';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function forwardHeaders(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') || 'default',
    authorization: req.headers.get('authorization') ?? '',
  };
}

export async function POST(req: NextRequest, { params }: { params: { dealId: string } }) {
  const body = await req.json();
  const res = await fetch(`${CRM_SERVICE}/api/v1/deals/${params.dealId}/room/items`, {
    method: 'POST',
    headers: { ...forwardHeaders(req), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
