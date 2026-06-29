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

const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

const REASON_LABELS: Record<string, string> = {
  COMPETITIVE_MATCH: 'Competitive match',
  STRATEGIC_ACCOUNT: 'Strategic account',
  VOLUME_COMMITMENT: 'Volume commitment',
  MULTI_YEAR_COMMITMENT: 'Multi-year commitment',
  NEW_LOGO_ACQUISITION: 'New logo acquisition',
  RENEWAL_SAVE: 'Renewal save',
  EXECUTIVE_EXCEPTION: 'Executive exception',
  MARKET_ENTRY: 'Market entry',
  BUNDLE_NEGOTIATION: 'Bundle negotiation',
  PAYMENT_TERMS_TRADEOFF: 'Payment terms trade-off',
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    let rows = [...state.discountRequests];
    const quoteId = req.nextUrl.searchParams.get('quoteId');
    const status = req.nextUrl.searchParams.get('status');
    if (quoteId) rows = rows.filter((item) => item.quoteId === quoteId);
    if (status) rows = rows.filter((item) => item.status === status);
    rows.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${FINANCE_SERVICE_URL}/api/v1/discount-requests${qs ? `?${qs}` : ''}`, {
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
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  const body = await req.json();
  const errors: Record<string, string> = {};
  const reasonCode = String(body.reasonCode ?? '');
  const requestedDiscountPercent = Number(body.requestedDiscountPercent);
  const winningProbabilityIfApproved = Number(body.winningProbabilityIfApproved);
  const hierarchy = Array.isArray(body.approverHierarchy) ? body.approverHierarchy : body.customFields?.approverHierarchy;
  if (!body.quoteId) errors.quoteId = 'Quote is required.';
  if (!REASON_LABELS[reasonCode]) errors.reasonCode = 'Choose a prevalidated discount reason.';
  if (!Number.isFinite(requestedDiscountPercent) || requestedDiscountPercent <= 0 || requestedDiscountPercent > 80) {
    errors.requestedDiscountPercent = 'Requested discount percent must be between 0.01 and 80.';
  }
  if (!Number.isFinite(winningProbabilityIfApproved) || winningProbabilityIfApproved < 1 || winningProbabilityIfApproved > 100) {
    errors.winningProbabilityIfApproved = 'Winning probability must be between 1 and 100.';
  }
  if (String(body.reasonNotes ?? '').trim().length < 10) errors.reasonNotes = 'Business reason must be at least 10 characters.';
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) errors.approverHierarchy = 'At least one approver level is required.';
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ...apiError('Discount request failed validation', 'VALIDATION_ERROR'), details: errors }, { status: 422 });
  }

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const quote = state.quotes.find((item) => item.id === body.quoteId);
    if (!quote) return NextResponse.json(apiError('Quote not found', 'NOT_FOUND'), { status: 404 });
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(String(quote.status))) {
      return NextResponse.json(apiError(`Cannot request discount for quote in status ${quote.status}`, 'BUSINESS_RULE'), { status: 422 });
    }

    const subtotal = Number(quote.subtotal ?? 0);
    if (!Number.isFinite(requestedDiscountPercent) || requestedDiscountPercent <= 0 || requestedDiscountPercent > 80) {
      return NextResponse.json(apiError('Requested discount percent must be between 0.01 and 80', 'VALIDATION_ERROR'), { status: 422 });
    }
    if (subtotal <= 0) {
      return NextResponse.json(apiError('Discount request requires a positive subtotal', 'VALIDATION_ERROR'), { status: 422 });
    }

    const now = new Date().toISOString();
    const request = {
      id: createId('drq'),
      tenantId: 'default',
      quoteId: quote.id,
      requestedById: String(body.requestedById ?? quote.ownerId ?? 'dev-admin'),
      approvalRequestId: createId('approval'),
      status: 'PENDING',
      reasonCode,
      reasonLabel: REASON_LABELS[reasonCode] ?? reasonCode,
      reasonNotes: body.reasonNotes ?? null,
      currentDiscountPercent: String(subtotal > 0 ? (Number(quote.discountTotal ?? 0) / subtotal) * 100 : 0),
      requestedDiscountPercent: String(requestedDiscountPercent),
      requestedDiscountAmount: String((subtotal * requestedDiscountPercent) / 100),
      winningProbabilityIfApproved: Number(body.winningProbabilityIfApproved ?? 0),
      businessImpact: body.businessImpact ?? null,
      competitorName: body.competitorName ?? null,
      expiresAt: body.expiresAt ?? null,
      customFields: body.customFields ?? {},
      approverHierarchy: hierarchy,
      createdAt: now,
      updatedAt: now,
    };
    state.discountRequests.unshift(request);
    quote.status = 'PENDING_APPROVAL';
    quote.approvalRequired = true;
    quote.approvalStatus = 'PENDING';
    quote.updatedAt = now;

    const contactId = resolveDevContactIdForCommercialRecord(quote);
    if (contactId) {
      recordDevContactCommercialEvent(contactId, {
        topic: 'quote.discount_request.created',
        title: `Discount request submitted: ${quote.quoteNumber}`,
        actor: request.requestedById,
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: { discountRequestId: request.id, requestedDiscountPercent, reasonCode },
      });
    }
    if (quote.accountId) {
      recordDevAccountCommercialEvent(String(quote.accountId), {
        topic: 'quote.discount_request.created',
        title: `Discount request submitted: ${quote.quoteNumber}`,
        actor: request.requestedById,
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: { discountRequestId: request.id, requestedDiscountPercent, reasonCode, contactId },
      });
    }

    return NextResponse.json(apiSuccess(request), { status: 201 });
  }

  const res = await fetch(`${FINANCE_SERVICE_URL}/api/v1/discount-requests`, {
    method: 'POST',
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
