import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const FINANCE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002/api/v1';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.text();

  if (DEV_PREVIEW_ENABLED) {
    const rule = getDevPreviewState().quoteAutomationRules.find((candidate) => candidate.id === params.id);
    if (!rule) return NextResponse.json(apiError('Quote automation rule not found', 'NOT_FOUND'), { status: 404 });

    Object.assign(rule, body ? JSON.parse(body) : {});
    return NextResponse.json(apiSuccess(rule));
  }

  try {
    const res = await fetch(`${FINANCE_URL}/quote-automation-rules/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    state.quoteAutomationRules = state.quoteAutomationRules.filter((rule) => rule.id !== params.id);
    return NextResponse.json(apiSuccess({ id: params.id }));
  }

  try {
    const res = await fetch(`${FINANCE_URL}/quote-automation-rules/${params.id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess({ id: params.id }));
  }
}
