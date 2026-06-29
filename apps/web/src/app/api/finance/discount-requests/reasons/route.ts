import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess } from '@/lib/server/dev-preview-data';

const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

const REASONS = [
  { code: 'COMPETITIVE_MATCH', label: 'Competitive match' },
  { code: 'STRATEGIC_ACCOUNT', label: 'Strategic account' },
  { code: 'VOLUME_COMMITMENT', label: 'Volume commitment' },
  { code: 'MULTI_YEAR_COMMITMENT', label: 'Multi-year commitment' },
  { code: 'NEW_LOGO_ACQUISITION', label: 'New logo acquisition' },
  { code: 'RENEWAL_SAVE', label: 'Renewal save' },
  { code: 'EXECUTIVE_EXCEPTION', label: 'Executive exception' },
  { code: 'MARKET_ENTRY', label: 'Market entry' },
  { code: 'BUNDLE_NEGOTIATION', label: 'Bundle negotiation' },
  { code: 'PAYMENT_TERMS_TRADEOFF', label: 'Payment terms trade-off' },
];

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  if (DEV_PREVIEW_ENABLED) return NextResponse.json(apiSuccess(REASONS));

  const res = await fetch(`${FINANCE_SERVICE_URL}/api/v1/discount-requests/reasons`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
