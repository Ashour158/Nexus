import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const rfq = getDevPreviewState().rfqs.find((item) => item.id === params.id);
    if (!rfq) return NextResponse.json(apiError('RFQ not found', 'NOT_FOUND'), { status: 404 });
    return NextResponse.json(apiSuccess(rfq));
  }
  const res = await fetch(`${FINANCE_URL}/rfqs/${params.id}`, {
    headers: { Authorization: auth ?? '' },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

