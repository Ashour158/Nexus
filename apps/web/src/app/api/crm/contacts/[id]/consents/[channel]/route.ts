import { NextRequest, NextResponse } from 'next/server';

const CRM = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; channel: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const authorization = req.headers.get('authorization') ?? '';
  let bodyStr = '{}';
  try {
    bodyStr = await req.text();
    if (!bodyStr) bodyStr = '{}';
  } catch {
    bodyStr = '{}';
  }
  const res = await fetch(
    `${CRM}/api/v1/contacts/${params.id}/consents/${encodeURIComponent(params.channel)}`,
    {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        ...(authorization ? { authorization } : {}),
      },
      body: bodyStr,
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
