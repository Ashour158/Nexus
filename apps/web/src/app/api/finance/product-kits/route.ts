import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  createId,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(getDevPreviewState().productKits));
  }
  try {
    const res = await fetch(`${FINANCE_URL}/product-kits`, {
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess([]));
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.text();
  if (DEV_PREVIEW_ENABLED) {
    const parsed = body ? JSON.parse(body) : {};
    const kit = {
      id: createId('kit'),
      name: String(parsed.name ?? 'New Product Kit'),
      sku: String(parsed.sku ?? createId('KIT').toUpperCase()),
      currency: String(parsed.currency ?? 'USD'),
      listPrice: Number(parsed.listPrice ?? 0),
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
    getDevPreviewState().productKits.unshift(kit);
    return NextResponse.json(apiSuccess(kit), { status: 201 });
  }
  try {
    const res = await fetch(`${FINANCE_URL}/product-kits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}

