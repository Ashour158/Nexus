import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const FINANCE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002/api/v1';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const quote = getDevPreviewState().quotes.find((item) => item.id === params.id);
    if (!quote) return NextResponse.json(apiError('Quote not found', 'NOT_FOUND'), { status: 404 });
    return NextResponse.json(apiSuccess(quote));
  }
  const res = await fetch(`${FINANCE_URL}/quotes/${params.id}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const quote = getDevPreviewState().quotes.find((item) => item.id === params.id);
    if (!quote) return NextResponse.json(apiError('Quote not found', 'NOT_FOUND'), { status: 404 });
    Object.assign(quote, body, { updatedAt: new Date().toISOString(), version: Number(quote.version ?? 1) + 1 });
    return NextResponse.json(apiSuccess(quote));
  }
  const res = await fetch(`${FINANCE_URL}/quotes/${params.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const index = state.quotes.findIndex((item) => item.id === params.id);
    if (index === -1) return NextResponse.json(apiError('Quote not found', 'NOT_FOUND'), { status: 404 });
    state.quotes.splice(index, 1);
    return NextResponse.json(apiSuccess({ deleted: true }));
  }
  const res = await fetch(`${FINANCE_URL}/quotes/${params.id}`, {
    method: 'DELETE',
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
