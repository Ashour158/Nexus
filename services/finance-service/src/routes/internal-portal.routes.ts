/**
 * Internal, account-scoped read/accept surface consumed by portal-service.
 *
 * A logged-in PortalUser is bound to a single `accountId`. portal-service calls
 * these endpoints with `x-service-token: $INTERNAL_SERVICE_TOKEN` + `x-tenant-id`
 * to render the customer's quotes / orders / invoices and to accept a quote.
 *
 * Trust model (mirrors finance-service `verifyServiceToken`): every route
 * self-verifies `x-service-token` against `INTERNAL_SERVICE_TOKEN` (401 otherwise)
 * and derives `tenantId` from the `x-tenant-id` header (400 if empty). Every read
 * is scoped by BOTH tenantId AND the path `accountId` — an accountId is never
 * trusted without also pinning tenantId — so a portal caller can only ever reach
 * one account's rows within one tenant.
 *
 * Customer-safe projection: internal margin/cost columns (`marginTotal`,
 * `pricingBreakdown`) are NEVER selected. Persisted CPQ line items carry only
 * customer-facing pricing (list/unit price, discount, tax, totals) — no per-line
 * cost/margin — so they are returned as-is.
 *
 * Routes live under `/api/v1/internal/...` so the shared bootstrap's
 * `isInternalServiceRoute` bypasses the end-user JWT preHandler for
 * service-token callers and seeds tenant ALS from `x-tenant-id`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { EngineContext } from '@nexus/domain-core';
import type { NexusProducer } from '@nexus/kafka';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import type { FinancePrisma } from '../prisma.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Customer-safe column projections. Deliberately OMIT internal-only fields:
 *   Quote:   marginTotal, pricingBreakdown (cost/margin), ownerId, dealId,
 *            approval*, priceBookId, rfqId, acceptanceToken, vendor/buyerTaxReg,
 *            appliedPromos, customFields.
 *   Order:   ownerId, dealId, customFields.
 *   Invoice: notes, subscriptionId, contractId, customFields.
 */
const QUOTE_SAFE_SELECT = {
  id: true,
  quoteNumber: true,
  name: true,
  accountId: true,
  contactId: true,
  status: true,
  currency: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  total: true,
  validUntil: true,
  expiresAt: true,
  sentAt: true,
  viewedAt: true,
  acceptedAt: true,
  rejectedAt: true,
  paymentTerms: true,
  terms: true,
  notes: true,
  lineItems: true,
  dueDate: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ORDER_SAFE_SELECT = {
  id: true,
  orderNumber: true,
  name: true,
  accountId: true,
  contactId: true,
  quoteId: true,
  status: true,
  currency: true,
  subtotal: true,
  taxAmount: true,
  discountAmount: true,
  total: true,
  orderedAt: true,
  expectedFulfillmentAt: true,
  fulfilledAt: true,
  cancelledAt: true,
  lineItems: true,
  createdAt: true,
  updatedAt: true,
} as const;

const INVOICE_SAFE_SELECT = {
  id: true,
  invoiceNumber: true,
  accountId: true,
  orderId: true,
  quoteId: true,
  status: true,
  currency: true,
  subtotal: true,
  taxAmount: true,
  discountAmount: true,
  total: true,
  dueDate: true,
  paidAt: true,
  paidAmount: true,
  lineItems: true,
  createdAt: true,
  updatedAt: true,
} as const;

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

function unauthorized(reply: FastifyReply, requestId: string) {
  return reply
    .code(401)
    .send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId } });
}

function badRequest(reply: FastifyReply, requestId: string, message: string) {
  return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message, requestId } });
}

function notFound(reply: FastifyReply, requestId: string, entity: string) {
  return reply
    .code(404)
    .send({ success: false, error: { code: 'NOT_FOUND', message: `${entity} not found`, requestId } });
}

function tenantIdFromHeader(req: FastifyRequest): string {
  const raw = req.headers['x-tenant-id'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
}

/** Coerce a Prisma Decimal (or nullish) into a plain JSON number. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value as never);
  return Number.isFinite(n) ? n : null;
}

/** System EngineContext for a service-token accept (no end-user JWT). */
function systemContext(req: FastifyRequest, tenantId: string, correlationId: string): EngineContext {
  return {
    audit: {
      actor: { userId: 'portal', tenantId, roles: ['system'], permissions: ['*'] },
      requestId: req.id,
      correlationId,
      source: 'system',
    },
    now: new Date(),
  };
}

type QuoteRow = Record<string, unknown>;

function serializeQuote(q: QuoteRow) {
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    name: q.name,
    accountId: q.accountId,
    contactId: q.contactId ?? null,
    status: q.status,
    currency: q.currency,
    subtotal: num(q.subtotal),
    discountAmount: num(q.discountAmount),
    taxAmount: num(q.taxAmount),
    total: num(q.total),
    validUntil: q.validUntil ?? null,
    expiresAt: q.expiresAt ?? null,
    sentAt: q.sentAt ?? null,
    viewedAt: q.viewedAt ?? null,
    acceptedAt: q.acceptedAt ?? null,
    rejectedAt: q.rejectedAt ?? null,
    paymentTerms: q.paymentTerms ?? null,
    terms: q.terms ?? null,
    notes: q.notes ?? null,
    lineItems: q.lineItems ?? [],
    dueDate: q.dueDate ?? null,
    version: q.version,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

function serializeOrder(o: QuoteRow) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    name: o.name,
    accountId: o.accountId,
    contactId: o.contactId ?? null,
    quoteId: o.quoteId ?? null,
    status: o.status,
    currency: o.currency,
    subtotal: num(o.subtotal),
    taxAmount: num(o.taxAmount),
    discountAmount: num(o.discountAmount),
    total: num(o.total),
    orderedAt: o.orderedAt ?? null,
    expectedFulfillmentAt: o.expectedFulfillmentAt ?? null,
    fulfilledAt: o.fulfilledAt ?? null,
    cancelledAt: o.cancelledAt ?? null,
    lineItems: o.lineItems ?? [],
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function serializeInvoice(i: QuoteRow) {
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    accountId: i.accountId,
    orderId: i.orderId ?? null,
    quoteId: i.quoteId ?? null,
    status: i.status,
    currency: i.currency,
    subtotal: num(i.subtotal),
    taxAmount: num(i.taxAmount),
    discountAmount: num(i.discountAmount),
    total: num(i.total),
    dueDate: i.dueDate ?? null,
    paidAt: i.paidAt ?? null,
    paidAmount: num(i.paidAmount),
    lineItems: i.lineItems ?? [],
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

export async function registerInternalPortalRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes: createQuotesService(prisma, producer),
    discountRequests: createDiscountRequestsService(prisma, producer),
    pricingEngine: new CpqPricingEngine(prisma),
    checkDiscountApproval,
  });

  await app.register(
    async (r) => {
      // ── Account-scoped lists ───────────────────────────────────────────────
      r.get('/internal/accounts/:accountId/quotes', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const tenantId = tenantIdFromHeader(req);
        if (!tenantId) return badRequest(reply, req.id, 'x-tenant-id is required');
        const { accountId } = req.params as { accountId: string };
        if (!accountId) return badRequest(reply, req.id, 'accountId is required');
        const q = ListQuerySchema.safeParse(req.query);
        if (!q.success) return badRequest(reply, req.id, 'Invalid pagination');

        const rows = await prisma.quote.findMany({
          where: { tenantId, accountId },
          select: QUOTE_SAFE_SELECT,
          orderBy: { createdAt: 'desc' },
          take: q.data.limit,
          skip: q.data.offset,
        });
        return reply.send({ success: true, data: rows.map((row) => serializeQuote(row as QuoteRow)) });
      });

      r.get('/internal/accounts/:accountId/orders', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const tenantId = tenantIdFromHeader(req);
        if (!tenantId) return badRequest(reply, req.id, 'x-tenant-id is required');
        const { accountId } = req.params as { accountId: string };
        if (!accountId) return badRequest(reply, req.id, 'accountId is required');
        const q = ListQuerySchema.safeParse(req.query);
        if (!q.success) return badRequest(reply, req.id, 'Invalid pagination');

        const rows = await prisma.salesOrder.findMany({
          where: { tenantId, accountId },
          select: ORDER_SAFE_SELECT,
          orderBy: { createdAt: 'desc' },
          take: q.data.limit,
          skip: q.data.offset,
        });
        return reply.send({ success: true, data: rows.map((row) => serializeOrder(row as QuoteRow)) });
      });

      r.get('/internal/accounts/:accountId/invoices', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const tenantId = tenantIdFromHeader(req);
        if (!tenantId) return badRequest(reply, req.id, 'x-tenant-id is required');
        const { accountId } = req.params as { accountId: string };
        if (!accountId) return badRequest(reply, req.id, 'accountId is required');
        const q = ListQuerySchema.safeParse(req.query);
        if (!q.success) return badRequest(reply, req.id, 'Invalid pagination');

        const rows = await prisma.invoice.findMany({
          where: { tenantId, accountId },
          select: INVOICE_SAFE_SELECT,
          orderBy: { createdAt: 'desc' },
          take: q.data.limit,
          skip: q.data.offset,
        });
        return reply.send({ success: true, data: rows.map((row) => serializeInvoice(row as QuoteRow)) });
      });

      // ── Single quote (portal does an ownership check on data.accountId) ─────
      r.get('/internal/quotes/:id', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const tenantId = tenantIdFromHeader(req);
        if (!tenantId) return badRequest(reply, req.id, 'x-tenant-id is required');
        const { id } = req.params as { id: string };
        if (!id) return badRequest(reply, req.id, 'quote id is required');

        const quote = await prisma.quote.findFirst({
          where: { id, tenantId },
          select: QUOTE_SAFE_SELECT,
        });
        if (!quote) return notFound(reply, req.id, 'Quote');
        return reply.send({ success: true, data: serializeQuote(quote as QuoteRow) });
      });

      // ── Accept (e-sign accept + convert-to-order) ──────────────────────────
      // Reuses the existing commercial use-case transitions exactly as the
      // authenticated `/quotes/:id/accept` + `CONVERT_TO_ORDER` paths do — no
      // money math or state-machine logic is re-implemented here. Idempotent:
      // re-invoking on an already-accepted/converted quote advances only the
      // remaining step (or nothing) instead of erroring.
      r.post('/internal/quotes/:id/accept', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const tenantId = tenantIdFromHeader(req);
        if (!tenantId) return badRequest(reply, req.id, 'x-tenant-id is required');
        const { id } = req.params as { id: string };
        if (!id) return badRequest(reply, req.id, 'quote id is required');

        const existing = await prisma.quote.findFirst({
          where: { id, tenantId },
          select: { id: true, status: true },
        });
        if (!existing) return notFound(reply, req.id, 'Quote');

        const correlationId =
          (typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id']) || req.id;
        const ctx = systemContext(req, tenantId, correlationId);

        let status = String(existing.status);
        // 1) e-sign accept (SENT/VIEWED → ACCEPTED)
        if (status === 'SENT' || status === 'VIEWED') {
          const accepted = await commercial.acceptQuote(ctx, id);
          status = String((accepted as { status?: unknown }).status ?? 'ACCEPTED');
        }
        // 2) convert-to-order (ACCEPTED → CONVERTED)
        let order: { id?: unknown; orderNumber?: unknown } | null = null;
        if (status === 'ACCEPTED') {
          order = (await commercial.convertQuoteToOrder(ctx, id)) as { id?: unknown; orderNumber?: unknown };
          status = 'CONVERTED';
        }

        return reply.send({
          success: true,
          data: {
            quoteId: id,
            status,
            orderId: order?.id ?? null,
            orderNumber: order?.orderNumber ?? null,
          },
        });
      });
    },
    { prefix: '/api/v1' }
  );
}
