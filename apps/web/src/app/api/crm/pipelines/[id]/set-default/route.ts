import { NextRequest, NextResponse } from 'next/server';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${C}/api/v1/pipelines/${params.id}`, {
    method: 'PATCH',
    headers: {
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isDefault: true }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
