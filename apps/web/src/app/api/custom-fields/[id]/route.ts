import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization') ?? '';
  const body = await req.json();
  const res = await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/custom-fields/${params.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization') ?? '';
  const res = await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/custom-fields/${params.id}`, {
    method: 'DELETE',
    headers: auth ? { Authorization: auth } : undefined,
  });
  return new NextResponse(null, { status: res.status });
}
