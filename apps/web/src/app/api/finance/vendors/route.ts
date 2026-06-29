import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  createId,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const FINANCE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002/api/v1';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(getDevPreviewState().vendors));
  }
  try {
    const res = await fetch(`${FINANCE_URL}/vendors`, {
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
    const vendor = {
      id: createId('vendor'),
      name: String(parsed.name ?? 'New Vendor'),
      code: String(parsed.code ?? createId('VEN').toUpperCase()),
      currency: String(parsed.currency ?? 'USD'),
      isActive: parsed.isActive ?? true,
      products: Array.isArray(parsed.products) ? parsed.products.map(String) : [],
    };
    getDevPreviewState().vendors.unshift(vendor);
    return NextResponse.json(apiSuccess(vendor), { status: 201 });
  }
  try {
    const res = await fetch(`${FINANCE_URL}/vendors`, {
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

