import { NextRequest, NextResponse } from 'next/server';

const C = process.env.COMM_SERVICE_URL || 'http://localhost:3009';

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const authorization = req.headers.get('authorization') ?? '';
  const res = await fetch(`${C}/api/v1/whatsapp/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(await req.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
