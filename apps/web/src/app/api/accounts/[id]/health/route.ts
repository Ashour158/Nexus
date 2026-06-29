import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const account = getDevPreviewState().accounts.find((item) => item.id === params.id);
    const score = Number(account?.healthScore ?? 70);
    return NextResponse.json(apiSuccess({
      accountId: params.id,
      score,
      status: score >= 75 ? 'HEALTHY' : score >= 50 ? 'AT_RISK' : 'CHURNING',
      npsScore: account?.npsScore ?? null,
      daysSinceLastTouch: 1,
      openSupportTickets: null,
      factors: [
        { code: 'PROFILE_DEPTH', label: 'Master data completeness', value: 92, impact: 'POSITIVE' },
        { code: 'COMMERCIAL_ACTIVITY', label: 'Linked quotes and orders', value: 2, impact: 'POSITIVE' },
      ],
      computedAt: new Date().toISOString(),
    }));
  }
  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/health`, {
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
