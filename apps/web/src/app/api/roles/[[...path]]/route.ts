import { NextRequest, NextResponse } from 'next/server';

// Server-side: reach auth-service by its internal URL (NEXT_PUBLIC_AUTH_URL is
// the browser-relative `/bff/auth` in prod and would fail a server fetch).
const AUTH_URL = process.env.AUTH_SERVICE_URL
  ? `${process.env.AUTH_SERVICE_URL}/api/v1`
  : process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3000/api/v1';

async function proxy(req: NextRequest, { params }: { params: { path?: string[] } }, method: string) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = params.path?.join('/') ?? '';
  const body = method !== 'GET' ? await req.text() : undefined;
  const search = req.nextUrl.searchParams.toString();

  const res = await fetch(`${AUTH_URL}/roles${path ? `/${path}` : ''}${method === 'GET' && search ? `?${search}` : ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export const GET = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'POST');
export const PATCH = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'PATCH');
export const DELETE = (req: NextRequest, ctx: { params: { path?: string[] } }) => proxy(req, ctx, 'DELETE');
