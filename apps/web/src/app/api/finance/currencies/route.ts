import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, createId, getDevPreviewState } from '@/lib/server/dev-preview-data';

const FINANCE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002/api/v1';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(getDevPreviewState().currencies));
  }

  const res = await fetch(`${FINANCE_URL}/currencies`, {
    headers: { Authorization: auth ?? '' },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const currency = {
      id: createId('cur'),
      code: String(body.code ?? 'USD').toUpperCase(),
      name: String(body.name ?? body.code ?? 'Currency'),
      symbol: String(body.symbol ?? body.code ?? '$'),
      decimalPlaces: Number(body.decimalPlaces ?? 2),
      isBase: Boolean(body.isBase),
      isActive: true,
    };
    if (currency.isBase) {
      state.currencies = state.currencies.map((item) => ({ ...item, isBase: false }));
    }
    state.currencies.unshift(currency);
    return NextResponse.json(apiSuccess(currency), { status: 201 });
  }

  const res = await fetch(`${FINANCE_URL}/currencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth ?? '' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
