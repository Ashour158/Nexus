import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  validateDevObject,
} from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const account = getDevPreviewState().accounts.find((item) => item.id === params.id);
    if (!account) return NextResponse.json(apiError('Account not found', 'NOT_FOUND'), { status: 404 });
    return NextResponse.json(apiSuccess(account));
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const account = getDevPreviewState().accounts.find((item) => item.id === params.id);
    if (!account) return NextResponse.json(apiError('Account not found', 'NOT_FOUND'), { status: 404 });
    const now = new Date().toISOString();
    const previous = { ...account };
    const merged = { ...account, ...body, id: account.id, tenantId: account.tenantId, updatedAt: now };
    const validation = validateDevObject('account', merged as Record<string, unknown>);
    if (!validation.valid) {
      return NextResponse.json(
        {
          ...apiError(Object.values(validation.errors)[0] ?? 'Account validation failed', 'VALIDATION_FAILED'),
          validation: validation.errors,
        },
        { status: 422 }
      );
    }
    const changedFields = Object.keys(body).filter((field) => previous[field] !== merged[field]);
    const previousCustomFields =
      account.customFields && typeof account.customFields === 'object'
        ? (account.customFields as Record<string, unknown>)
        : {};
    const previousList = (key: string) => {
      const value = previousCustomFields[key];
      return Array.isArray(value) ? value : [];
    };
    Object.assign(account, merged, {
      customFields: {
        ...previousCustomFields,
        fieldHistory: [
          ...changedFields.map((field) => ({
            id: createId('field'),
            objectType: 'account',
            objectId: params.id,
            fieldName: field,
            oldValue: previous[field] == null ? null : String(previous[field]),
            newValue: merged[field] == null ? null : String(merged[field]),
            changedBy: 'dev-admin',
            changedByName: 'Preview Admin',
            changedAt: now,
          })),
          ...previousList('fieldHistory'),
        ],
        auditTrail: [
          {
            id: createId('audit'),
            type: 'account.updated',
            action: changedFields.length ? `Updated ${changedFields.join(', ')}` : 'Account touched',
            actor: 'Preview Admin',
            at: now,
          },
          ...previousList('auditTrail'),
        ],
        outboxEvents: [
          {
            id: createId('outbox'),
            type: 'account.updated',
            aggregateId: params.id,
            status: 'PENDING',
            createdAt: now,
            payload: { accountId: params.id, changedFields },
          },
          ...previousList('outboxEvents'),
        ],
      },
    });
    return NextResponse.json(apiSuccess(account));
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
