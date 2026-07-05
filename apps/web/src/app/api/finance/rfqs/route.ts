import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  paginated,
  recordDevAccountCommercialEvent,
  recordDevContactCommercialEvent,
  resolveDevContactIdForCommercialRecord,
} from '@/lib/server/dev-preview-data';
import { validatePreviewRfqCreatePayload } from '@/lib/server/cpq-authority';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    let rows = [...state.rfqs];
    const contactId = req.nextUrl.searchParams.get('contactId');
    const dealId = req.nextUrl.searchParams.get('dealId');
    const accountId = req.nextUrl.searchParams.get('accountId');
    if (contactId) rows = rows.filter((rfq) => resolveDevContactIdForCommercialRecord(rfq) === contactId);
    if (dealId) rows = rows.filter((rfq) => rfq.dealId === dealId);
    if (accountId) rows = rows.filter((rfq) => rfq.accountId === accountId);
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }
  const res = await fetch(`${FINANCE_URL}/rfqs`, {
    headers: { Authorization: auth ?? '' },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const validation = validatePreviewRfqCreatePayload(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          ...apiError('RFQ validation failed', 'VALIDATION_ERROR'),
          validation: validation.errors,
        },
        { status: 422 }
      );
    }
    const state = getDevPreviewState();
    const now = new Date().toISOString();
    const contactId = resolveDevContactIdForCommercialRecord(body);
    const rfq = {
      id: createId('rfq'),
      tenantId: 'default',
      dealId: String(body.dealId ?? ''),
      accountId: String(body.accountId ?? ''),
      contactId,
      ownerId: String(body.ownerId ?? 'dev-admin'),
      rfqNumber: String(body.rfqNumber ?? `RFQ-${new Date().getFullYear()}-${String(state.rfqs.length + 1).padStart(6, '0')}`),
      title: String(body.title ?? body.name ?? 'Preview RFQ'),
      name: String(body.name ?? body.title ?? 'Preview RFQ'),
      status: String(body.status ?? 'DRAFT'),
      currency: String(body.currency ?? 'USD'),
      lineItems: Array.isArray(body.items) ? body.items : Array.isArray(body.lineItems) ? body.lineItems : [],
      convertedQuoteId: null,
      createdAt: now,
      updatedAt: now,
    };
    state.rfqs.unshift(rfq);
    if (contactId) {
      recordDevContactCommercialEvent(contactId, {
        topic: 'rfq.created',
        title: `RFQ created: ${rfq.rfqNumber}`,
        actor: rfq.ownerId,
        aggregateType: 'rfq',
        aggregateId: rfq.id,
        payload: { rfqId: rfq.id, rfqNumber: rfq.rfqNumber, dealId: rfq.dealId, accountId: rfq.accountId },
      });
    }
    if (rfq.accountId) {
      recordDevAccountCommercialEvent(String(rfq.accountId), {
        topic: 'rfq.created',
        title: `RFQ created: ${rfq.rfqNumber}`,
        actor: rfq.ownerId,
        aggregateType: 'rfq',
        aggregateId: rfq.id,
        payload: { rfqId: rfq.id, rfqNumber: rfq.rfqNumber, dealId: rfq.dealId, contactId },
      });
    }
    return NextResponse.json(apiSuccess(rfq), { status: 201 });
  }
  const res = await fetch(`${FINANCE_URL}/rfqs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth ?? '' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

