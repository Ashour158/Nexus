import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  recordDevAccountCommercialEvent,
  recordDevContactCommercialEvent,
  resolveDevContactIdForCommercialRecord,
} from '@/lib/server/dev-preview-data';
import { assertRfqConvertible } from '@/lib/server/cpq-authority';

const FINANCE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002/api/v1';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const rfq = state.rfqs.find((item) => item.id === params.id);
    if (!rfq) return NextResponse.json(apiError('RFQ not found', 'NOT_FOUND'), { status: 404 });
    const transition = assertRfqConvertible(rfq);
    if (!transition.valid) {
      return NextResponse.json(
        {
          ...apiError('RFQ cannot be converted yet', 'BUSINESS_RULE'),
          validation: transition.errors,
        },
        { status: 422 }
      );
    }
    const now = new Date().toISOString();
    const contactId = resolveDevContactIdForCommercialRecord(rfq);
    const quote = {
      id: createId('quote'),
      tenantId: 'default',
      dealId: rfq.dealId,
      accountId: rfq.accountId,
      contactId,
      rfqId: rfq.id,
      ownerId: rfq.ownerId,
      quoteNumber: `Q-${new Date().getFullYear()}-${String(state.quotes.length + 1).padStart(6, '0')}`,
      name: `${rfq.name} Quote`,
      status: 'DRAFT',
      version: 1,
      currency: rfq.currency,
      subtotal: '67500',
      discountTotal: '0',
      taxTotal: '3375',
      total: '70875',
      approvalRequired: true,
      approvalStatus: 'NOT_SUBMITTED',
      lineItems: Array.isArray(rfq.lineItems) ? rfq.lineItems : [],
      terms: 'Generated from RFQ conversion and linked to the contact commercial timeline.',
      notes: 'RFQ-to-quote conversion created by CPQ preview workflow.',
      createdAt: now,
      updatedAt: now,
    };
    rfq.status = 'CONVERTED';
    rfq.convertedQuoteId = quote.id;
    rfq.updatedAt = now;
    state.quotes.unshift(quote);
    if (contactId) {
      recordDevContactCommercialEvent(contactId, {
        topic: 'rfq.converted',
        title: `RFQ converted to quote: ${quote.quoteNumber}`,
        actor: quote.ownerId,
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: { rfqId: rfq.id, quoteId: quote.id, quoteNumber: quote.quoteNumber, dealId: quote.dealId, accountId: quote.accountId },
      });
    }
    if (quote.accountId) {
      recordDevAccountCommercialEvent(quote.accountId, {
        topic: 'rfq.converted',
        title: `RFQ converted to quote: ${quote.quoteNumber}`,
        actor: quote.ownerId,
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: { rfqId: rfq.id, quoteId: quote.id, quoteNumber: quote.quoteNumber, dealId: quote.dealId, contactId },
      });
    }
    return NextResponse.json(apiSuccess({ rfqId: rfq.id, quoteId: quote.id, quote }), { status: 201 });
  }
  const res = await fetch(`${FINANCE_URL}/rfqs/${params.id}/convert`, {
    method: 'POST',
    headers: { Authorization: auth ?? '' },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

