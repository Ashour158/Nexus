import { NextRequest, NextResponse } from 'next/server';

const COMM_URL = process.env.COMM_SERVICE_URL || 'http://localhost:3009';

async function proxy(req: NextRequest, { params }: { params: { path?: string[] } }, method: string) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = params.path?.join('/') ?? '';
  const body = method !== 'GET' ? await req.text() : undefined;
  const search = req.nextUrl.searchParams.toString();
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';

  const res = await fetch(
    `${COMM_URL}/api/v1/sequences${path ? `/${path}` : ''}${method === 'GET' && search ? `?${search}` : ''}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'x-tenant-id': tenantId,
      },
      body,
    }
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export const GET = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'POST');
export const PATCH = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'PATCH');
export const DELETE = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'DELETE');
