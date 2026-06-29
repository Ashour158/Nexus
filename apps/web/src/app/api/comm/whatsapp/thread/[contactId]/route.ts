import { NextRequest, NextResponse } from 'next/server';

const C = process.env.COMM_SERVICE_URL || 'http://localhost:3009';

export async function GET(
  req: NextRequest,
  { params }: { params: { contactId: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const authorization = req.headers.get('authorization') ?? '';
  const res = await fetch(`${C}/api/v1/whatsapp/thread/${params.contactId}`, {
    headers: {
      'x-tenant-id': tenantId,
      ...(authorization ? { authorization } : {}),
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
