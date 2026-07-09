import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  createId,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

function authOr401(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  return auth && auth.startsWith('Bearer ') ? auth : null;
}

export async function GET(req: NextRequest) {
  const auth = authOr401(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (DEV_PREVIEW_ENABLED) {
    const products = getDevPreviewState().products.filter((product) =>
      q ? `${product.name} ${product.sku}`.toLowerCase().includes(q.toLowerCase()) : true
    );
    return NextResponse.json(apiSuccess(products));
  }

  try {
    const res = await fetch(`${process.env.FINANCE_SERVICE_URL}/api/v1/products?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: auth },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess([]));
  }
}

export async function POST(req: NextRequest) {
  const auth = authOr401(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const payload = {
    ...body,
    listPrice: body.price ?? body.listPrice ?? 0,
    type: body.type ?? 'SERVICE',
    billingType: body.billingType ?? 'ONE_TIME',
    taxable: body.taxable ?? true,
    pricingRules: body.pricingRules ?? [],
    priceTiers: body.priceTiers ?? [],
    customFields: body.customFields ?? {},
  };

  if (DEV_PREVIEW_ENABLED) {
    const product = {
      id: createId('prod'),
      name: String(payload.name ?? 'New Product'),
      nameAr: payload.nameAr ?? null,
      sku: String(payload.sku ?? createId('sku').toUpperCase()),
      currency: String(payload.currency ?? 'USD'),
      listPrice: Number(payload.listPrice ?? 0),
      isActive: payload.isActive ?? true,
      type: String(payload.type),
      billingType: String(payload.billingType),
      taxable: Boolean(payload.taxable),
    };
    getDevPreviewState().products.unshift(product);
    return NextResponse.json(apiSuccess(product), { status: 201 });
  }

  try {
    const res = await fetch(`${process.env.FINANCE_SERVICE_URL}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(payload), { status: 202 });
  }
}
