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
  validateDevObject,
} from '@/lib/server/dev-preview-data';
import { validatePreviewQuoteCreatePayload } from '@/lib/server/cpq-authority';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    let rows = [...state.quotes];
    const contactId = req.nextUrl.searchParams.get('contactId');
    const dealId = req.nextUrl.searchParams.get('dealId');
    const accountId = req.nextUrl.searchParams.get('accountId');
    const status = req.nextUrl.searchParams.get('status');
    if (contactId) rows = rows.filter((quote) => resolveDevContactIdForCommercialRecord(quote) === contactId);
    if (dealId) rows = rows.filter((quote) => quote.dealId === dealId);
    if (accountId) rows = rows.filter((quote) => quote.accountId === accountId);
    if (status) rows = rows.filter((quote) => quote.status === status);
    rows.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${FINANCE_URL}/quotes${qs ? `?${qs}` : ''}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const authorityValidation = validatePreviewQuoteCreatePayload(body);
    if (!authorityValidation.valid) {
      return NextResponse.json(
        {
          ...apiError('Quote validation failed', 'VALIDATION_ERROR'),
          validation: authorityValidation.errors,
        },
        { status: 422 }
      );
    }
    const state = getDevPreviewState();
    const now = new Date().toISOString();
    const contactId = resolveDevContactIdForCommercialRecord(body);
    const quote = {
      id: createId('quote'),
      tenantId: 'default',
      dealId: String(body.dealId ?? ''),
      accountId: String(body.accountId ?? ''),
      contactId,
      rfqId: body.rfqId ?? null,
      ownerId: String(body.ownerId ?? 'dev-admin'),
      templateId: body.templateId ?? state.quoteTemplates.find((item) => item.isDefault)?.id ?? null,
      approverId: body.approverId ?? null,
      quoteNumber: String(body.quoteNumber ?? `Q-${new Date().getFullYear()}-${String(state.quotes.length + 1).padStart(6, '0')}`),
      name: String(body.name ?? 'Preview quote'),
      status: String(body.status ?? 'DRAFT'),
      version: 1,
      currency: String(body.currency ?? 'USD'),
      subtotal: String(body.subtotal ?? body.total ?? '0'),
      discountTotal: String(body.discountTotal ?? '0'),
      taxTotal: String(body.taxTotal ?? '0'),
      total: String(body.total ?? body.subtotal ?? '0'),
      paymentTerms: body.paymentTerms ?? null,
      validUntil: body.validUntil ?? body.expiresAt ?? null,
      expiresAt: body.expiresAt ?? body.validUntil ?? null,
      approvalRequired: Boolean(body.approvalRequired ?? false),
      approvalStatus: body.approvalStatus ?? 'NOT_SUBMITTED',
      lineItems: Array.isArray(body.items) ? body.items : Array.isArray(body.lineItems) ? body.lineItems : [],
      terms: body.terms ?? null,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const validation = validateDevObject('quote', quote);
    if (!validation.valid) {
      return NextResponse.json(
        {
          ...apiError('Quote validation failed', 'VALIDATION_FAILED'),
          validation: validation.errors,
        },
        { status: 422 }
      );
    }
    state.quotes.unshift(quote);
    if (body.discountRequest) {
      const requestedDiscountPercent = Number(body.discountRequest.requestedDiscountPercent ?? 0);
      const reasonCode = String(body.discountRequest.reasonCode ?? 'COMPETITIVE_MATCH');
      state.discountRequests.unshift({
        id: createId('drq'),
        tenantId: 'default',
        quoteId: quote.id,
        requestedById: quote.ownerId,
        approvalRequestId: createId('approval'),
        status: 'PENDING',
        reasonCode,
        reasonLabel: reasonCode.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
        reasonNotes: body.discountRequest.reasonNotes ?? null,
        currentDiscountPercent: '0',
        requestedDiscountPercent: String(requestedDiscountPercent),
        requestedDiscountAmount: String((Number(quote.subtotal) * requestedDiscountPercent) / 100),
        winningProbabilityIfApproved: Number(body.discountRequest.winningProbabilityIfApproved ?? 0),
        businessImpact: body.discountRequest.businessImpact ?? null,
        competitorName: body.discountRequest.competitorName ?? null,
        createdAt: now,
        updatedAt: now,
      });
      quote.status = 'PENDING_APPROVAL';
      quote.approvalRequired = true;
      quote.approvalStatus = 'PENDING';
    }
    if (contactId) {
      recordDevContactCommercialEvent(contactId, {
        topic: 'quote.created',
        title: `Quote created: ${quote.quoteNumber}`,
        actor: quote.ownerId,
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: { quoteId: quote.id, quoteNumber: quote.quoteNumber, dealId: quote.dealId, accountId: quote.accountId },
      });
    }
    if (quote.accountId) {
      recordDevAccountCommercialEvent(quote.accountId, {
        topic: 'quote.created',
        title: `Quote created: ${quote.quoteNumber}`,
        actor: quote.ownerId,
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: { quoteId: quote.id, quoteNumber: quote.quoteNumber, dealId: quote.dealId, contactId },
      });
    }
    return NextResponse.json(apiSuccess({ quote, pricing: { source: 'preview-cpq', total: quote.total } }), { status: 201 });
  }

  const res = await fetch(`${FINANCE_URL}/quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
