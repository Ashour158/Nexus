import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, createId, getDevPreviewState } from '@/lib/server/dev-preview-data';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(getDevPreviewState().taxRates));
  }

  const res = await fetch(`${FINANCE_URL}/tax-rates`, {
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
    const rate = {
      id: createId('tax-rate'),
      zoneId: String(body.zoneId || state.taxZones[0]?.id || 'tax-zone-default'),
      name: String(body.name ?? 'Tax Rate'),
      code: String(body.code ?? 'TAX_STANDARD'),
      rate: Number(body.rate ?? 0),
    };
    state.taxRates.unshift(rate);
    return NextResponse.json(apiSuccess(rate), { status: 201 });
  }

  const res = await fetch(`${FINANCE_URL}/tax-rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth ?? '' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
