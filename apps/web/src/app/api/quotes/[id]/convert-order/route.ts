import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  recordDevAccountCommercialEvent,
  recordDevContactCommercialEvent,
} from '@/lib/server/dev-preview-data';

const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const quote = state.quotes.find((item) => item.id === params.id);
    if (!quote) return NextResponse.json(apiError('Quote not found', 'NOT_FOUND'), { status: 404 });
    if (!['APPROVED', 'ACCEPTED'].includes(String(quote.status))) {
      return NextResponse.json(apiError('Only approved or accepted quotes can convert to orders', 'BUSINESS_RULE'), { status: 422 });
    }
    const openEnvelope = state.quoteESignEnvelopes.find((item) => item.quoteId === quote.id && ['SENT', 'VIEWED'].includes(String(item.status)));
    if (openEnvelope) return NextResponse.json(apiError('Complete or void the open e-sign envelope before order conversion', 'BUSINESS_RULE'), { status: 422 });
    const now = new Date().toISOString();
    const lineItems = Array.isArray(quote.lineItems) ? quote.lineItems : [];
    const order = {
      id: createId('order'),
      tenantId: 'default',
      accountId: quote.accountId,
      contactId: quote.contactId ?? null,
      dealId: quote.dealId,
      quoteId: quote.id,
      ownerId: quote.ownerId,
      orderNumber: `SO-${new Date().getFullYear()}-${String(state.orders.length + 1).padStart(6, '0')}`,
      name: `Order from ${quote.quoteNumber}`,
      status: 'CONFIRMED',
      currency: quote.currency,
      total: quote.total,
      orderedAt: now,
      lineItems,
      createdAt: now,
      updatedAt: now,
    };
    state.orders.unshift(order);
    quote.status = 'CONVERTED';
    quote.updatedAt = now;
    if (quote.accountId) {
      recordDevAccountCommercialEvent(String(quote.accountId), {
        topic: 'quote.converted_to_order',
        title: `Quote converted to order: ${quote.quoteNumber}`,
        actor: String(quote.ownerId),
        aggregateType: 'order',
        aggregateId: order.id,
        payload: { quoteId: quote.id, orderId: order.id },
      });
    }
    if (quote.contactId) {
      recordDevContactCommercialEvent(String(quote.contactId), {
        topic: 'quote.converted_to_order',
        title: `Quote converted to order: ${quote.quoteNumber}`,
        actor: String(quote.ownerId),
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: { orderId: order.id },
      });
    }
    return NextResponse.json(apiSuccess(order), { status: 201 });
  }
  const res = await fetch(`${FINANCE_SERVICE_URL}/api/v1/quotes/${params.id}/convert-order`, {
    method: 'POST',
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
