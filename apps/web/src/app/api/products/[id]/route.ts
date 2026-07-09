import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  apiError,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

function authOr401(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  return auth && auth.startsWith('Bearer ') ? auth : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = authOr401(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const body = await req.json().catch(() => ({}));

  // Normalize the pricing field: forms may send `price`, backend expects `listPrice`.
  const payload: Record<string, unknown> = { ...body };
  if (payload.price != null && payload.listPrice == null) {
    payload.listPrice = payload.price;
  }
  delete payload.price;
  if (payload.listPrice != null) payload.listPrice = Number(payload.listPrice);

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      return NextResponse.json(apiError('Product not found', 'NOT_FOUND'), { status: 404 });
    }
    const current = state.products[idx];
    const updated = {
      ...current,
      ...(payload.name != null ? { name: String(payload.name) } : {}),
      ...(payload.nameAr !== undefined ? { nameAr: (payload.nameAr as string) || null } : {}),
      ...(payload.sku != null ? { sku: String(payload.sku) } : {}),
      ...(payload.currency != null ? { currency: String(payload.currency) } : {}),
      ...(payload.listPrice != null ? { listPrice: Number(payload.listPrice) } : {}),
      ...(payload.isActive != null ? { isActive: Boolean(payload.isActive) } : {}),
      ...(payload.type != null ? { type: String(payload.type) } : {}),
      ...(payload.billingType != null ? { billingType: String(payload.billingType) } : {}),
      ...(payload.taxable != null ? { taxable: Boolean(payload.taxable) } : {}),
    };
    state.products[idx] = updated;
    return NextResponse.json(apiSuccess(updated));
  }

  try {
    const res = await fetch(`${process.env.FINANCE_SERVICE_URL}/api/v1/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiError('Failed to update product'), { status: 502 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = authOr401(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      return NextResponse.json(apiError('Product not found', 'NOT_FOUND'), { status: 404 });
    }
    state.products.splice(idx, 1);
    return NextResponse.json(apiSuccess({ id, deleted: true }));
  }

  try {
    const res = await fetch(`${process.env.FINANCE_SERVICE_URL}/api/v1/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiError('Failed to delete product'), { status: 502 });
  }
}
