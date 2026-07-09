import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function host(value: unknown) {
  return normalize(value).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const accounts = getDevPreviewState().accounts;
    const account = accounts.find((item) => item.id === params.id);
    if (!account) return NextResponse.json(apiError('Account not found', 'NOT_FOUND'), { status: 404 });
    const current = {
      name: normalize(account.name),
      code: normalize(account.code),
      email: normalize(account.email),
      phone: normalize(account.phone),
      taxId: normalize(account.taxId),
      vatNumber: normalize(account.vatNumber),
      website: host(account.website),
    };
    const rows = accounts
      .filter((item) => item.id !== params.id)
      .map((item) => {
        const matches = [
          current.code && current.code === normalize(item.code) ? 'code' : null,
          current.taxId && current.taxId === normalize(item.taxId) ? 'taxId' : null,
          current.vatNumber && current.vatNumber === normalize(item.vatNumber) ? 'vatNumber' : null,
          current.email && current.email === normalize(item.email) ? 'email' : null,
          current.phone && current.phone === normalize(item.phone) ? 'phone' : null,
          current.website && current.website === host(item.website) ? 'website' : null,
          current.name && current.name === normalize(item.name) ? 'name' : null,
        ].filter(Boolean);
        return matches.length ? { ...item, duplicateSignals: matches, score: Math.min(100, 45 + matches.length * 12) } : null;
      })
      .filter(Boolean)
      .sort((left, right) => Number((right as { score: number }).score) - Number((left as { score: number }).score));
    return NextResponse.json(apiSuccess(rows));
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/duplicates`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
