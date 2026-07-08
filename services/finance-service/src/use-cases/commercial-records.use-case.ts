import { createHash } from 'node:crypto';
import { toPaginatedResult } from '@nexus/shared-types';
import type { EngineContext } from '@nexus/domain-core';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { BusinessRuleError, NexusError, NotFoundError, ValidationError } from '@nexus/service-utils';
import type {
  CreateDiscountRequestInput,
  CreateQuoteInput,
  DiscountRequestListQuery,
  QuoteListQuery,
  UpdateQuoteInput,
} from '@nexus/validation';
import {
  Prisma,
  type QuoteTemplate,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import type {
  CpqPricingRequestEx,
  CpqPricingResultEx,
} from '../cpq/pricing-engine.js';
import { buildQuoteDocxBuffer } from '../lib/docx-generator.js';
import { generatePDF } from '../lib/pdf-generator.js';
import type { DiscountRequestsService } from '../services/discount-requests.service.js';
import type { QuotesService } from '../services/quotes.service.js';
import { allocateDocumentNumber, type SqlRunner } from '../lib/document-sequence.js';

type PricingEngine = {
  calculate(input: CpqPricingRequestEx): Promise<CpqPricingResultEx>;
};

type DiscountApprovalCheck = (
  prisma: FinancePrisma,
  tenantId: string,
  quoteId: string,
  subtotal: number,
  discountAmount: number,
  requestedById: string,
  reference: string,
  reasonCode?: string
) => Promise<{
  required: boolean;
  requestId?: string;
  actualDiscountPercent: number;
  thresholdPercent: number;
  approverTier?: string;
}>;

export type CommercialRecordsUseCaseDeps = {
  prisma: FinancePrisma;
  producer: NexusProducer;
  quotes: QuotesService;
  discountRequests: DiscountRequestsService;
  pricingEngine: PricingEngine;
  checkDiscountApproval: DiscountApprovalCheck;
};

type RfqInput = {
  title: string;
  dealId?: string;
  accountId: string;
  contactId?: string;
  currency?: string;
  requiredByDate?: Date;
  lineItems?: Array<Record<string, unknown>>;
  internalNotes?: string;
};

type OrderListQuery = {
  page: number;
  limit: number;
  accountId?: string;
  contactId?: string;
  dealId?: string;
  quoteId?: string;
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'CONFIRMED' | 'FULFILLING' | 'FULFILLED' | 'CANCELLED' | 'CLOSED';
  sortDir: 'asc' | 'desc';
};

type CreateOrderInput = {
  accountId: string;
  contactId?: string;
  dealId?: string;
  quoteId?: string;
  sourceType?: 'MANUAL';
  ownerId: string;
  name: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'CONFIRMED' | 'FULFILLING' | 'FULFILLED' | 'CANCELLED' | 'CLOSED';
  currency: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  orderedAt?: string;
  expectedFulfillmentAt?: string;
  lineItems: Array<Record<string, unknown>>;
  customFields: Record<string, unknown>;
};

type QuoteTemplateInput = {
  name: string;
  description?: string;
  storageKey?: string;
  version?: number;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  contentType?: 'text/html' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  body?: string;
  contentBase64?: string;
  variables?: Array<Record<string, unknown>>;
  isDefault?: boolean;
  isActive?: boolean;
  language?: 'en' | 'ar';
};

type RenderQuoteDocumentInput = {
  templateId?: string;
  format: 'HTML' | 'PDF' | 'DOCX';
};

type SendSignatureInput = {
  documentId?: string;
  recipientName: string;
  recipientEmail: string;
  expiresAt?: string;
  provider: string;
};

type UpdateSignatureInput = {
  status: 'VIEWED' | 'SIGNED' | 'DECLINED' | 'VOIDED' | 'EXPIRED';
  declinedReason?: string;
};

type CpqEntity = 'rfq' | 'quote' | 'drq' | 'order';

type CpqTransitionCommand = {
  tenantId: string;
  actorId: string;
  entity: CpqEntity;
  entityId: string;
  action: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

type CpqTransitionMeta = {
  idempotencyKey?: string;
  correlationId?: string;
  source?: string;
  sourceEventId?: string;
  approvalRequestId?: string;
};

type ApprovalTransitionInput = {
  approvalRequestId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  sourceEventId?: string;
  approvedById?: string;
  rejectedById?: string;
  rejectionReason?: string;
};

const RFQ_CONVERTIBLE_STATUSES = new Set(['REVIEWING', 'RESPONDED', 'READY_FOR_QUOTE']);

function actor(ctx: EngineContext) {
  return ctx.audit.actor;
}

function templateStorageKey(tenantId: string, name: string) {
  return `quote-templates/${tenantId}/${name.toLowerCase().replaceAll(/\s+/g, '-')}`;
}

function assertTemplateContent(value: QuoteTemplateInput) {
  const contentType = value.contentType ?? 'text/html';
  if (contentType === 'text/html' && !String(value.body ?? '').includes('{{quoteNumber}}')) {
    throw new ValidationError('Invalid body', {
      fieldErrors: { body: ['HTML quote templates must include {{quoteNumber}}.'] },
      formErrors: [],
    });
  }

  if (contentType.includes('wordprocessingml')) {
    const signature = value.contentBase64
      ? Buffer.from(value.contentBase64, 'base64').subarray(0, 4).toString('hex').toUpperCase()
      : '';
    if (signature !== '504B0304') {
      throw new ValidationError('Invalid body', {
        fieldErrors: { contentBase64: ['Uploaded DOCX template is invalid or empty.'] },
        formErrors: [],
      });
    }
  }
}

function normalizeRfqLineItems(lineItems: unknown) {
  return (Array.isArray(lineItems) ? lineItems : [])
    .map((line) => line && typeof line === 'object' && !Array.isArray(line) ? line as Record<string, unknown> : null)
    .filter((line): line is Record<string, unknown> => Boolean(line))
    .map((line) => ({
      productId: String(line.productId ?? ''),
      quantity: Number(line.quantity ?? 1),
    }))
    .filter((line) => line.productId && Number.isInteger(line.quantity) && line.quantity > 0);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function fieldErrors(errors: Record<string, string[]>) {
  throw new ValidationError('Invalid commercial command', {
    fieldErrors: errors,
    formErrors: [],
  });
}

function normalizedCommercialLines(lineItems: unknown) {
  return (Array.isArray(lineItems) ? lineItems : [])
    .map((line) => line && typeof line === 'object' && !Array.isArray(line) ? line as Record<string, unknown> : null)
    .filter((line): line is Record<string, unknown> => Boolean(line))
    .filter((line) => {
      const productId = String(line.productId ?? line.sku ?? '');
      const quantity = Number(line.quantity ?? 0);
      const price = line.unitPrice ?? line.listPrice ?? line.manualOverridePrice ?? line.competitiveOverridePrice;
      return productId.length > 0 && Number.isFinite(quantity) && quantity > 0 && (price === undefined || Number.isFinite(Number(price)));
    });
}

// ─── Quote-to-cash: recurring subscription detection ────────────────────────
// A quote/order line is "recurring" when its underlying Product is billed
// RECURRING (BillingType.RECURRING) or is of type SUBSCRIPTION. We resolve the
// signal from the Product catalog; if a line already carries a billingType we
// honour it as a fallback so we never depend on data we cannot see.

type RecurringSubscriptionLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  billingPeriod: string;
};

function recurringPeriodOf(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'MONTHLY' || raw === 'QUARTERLY' || raw === 'ANNUAL' || raw === 'ANNUALLY' || raw === 'YEARLY' || raw === 'WEEKLY') {
    return raw === 'ANNUALLY' || raw === 'YEARLY' ? 'ANNUAL' : raw;
  }
  return 'MONTHLY';
}

// Normalizes a billing period into a monthly MRR multiplier.
function monthlyFactorFor(period: string): number {
  switch (period) {
    case 'ANNUAL':
      return 1 / 12;
    case 'QUARTERLY':
      return 1 / 3;
    case 'WEEKLY':
      return 52 / 12;
    default:
      return 1; // MONTHLY
  }
}

function isRecurringProduct(product: { billingType?: unknown; type?: unknown } | null | undefined): boolean {
  if (!product) return false;
  return String(product.billingType ?? '').toUpperCase() === 'RECURRING'
    || String(product.type ?? '').toUpperCase() === 'SUBSCRIPTION';
}

async function resolveRecurringLines(
  prisma: FinancePrisma,
  tenantId: string,
  lineItems: unknown
): Promise<RecurringSubscriptionLine[]> {
  const lines = normalizedCommercialLines(lineItems);
  if (lines.length === 0) return [];

  const productIds = Array.from(
    new Set(lines.map((line) => String(line.productId ?? line.sku ?? '')).filter((id) => id.length > 0))
  );
  if (productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const recurring: RecurringSubscriptionLine[] = [];
  for (const line of lines) {
    const productId = String(line.productId ?? line.sku ?? '');
    if (!productId) continue;
    const product = byId.get(productId) ?? null;
    // Fall back to a line-level billingType flag if the catalog has no record.
    const lineIsRecurring = String(line.billingType ?? '').toUpperCase() === 'RECURRING';
    if (!isRecurringProduct(product) && !lineIsRecurring) continue;

    const quantity = Number(line.quantity ?? 1) || 1;
    const unitPrice = Number(
      line.unitPrice ?? line.listPrice ?? (product ? Number(product.listPrice) : 0) ?? 0
    );
    const billingPeriod = recurringPeriodOf(
      line.billingPeriod ?? (product ? product.billingPeriod : undefined)
    );
    recurring.push({
      productId,
      productName: String(line.productName ?? line.name ?? product?.name ?? productId),
      quantity,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      billingPeriod,
    });
  }
  return recurring;
}

function assertRfqCreateAuthority(data: RfqInput) {
  const errors: Record<string, string[]> = {};
  if (!hasText(data.dealId)) errors.dealId = ['RFQ creation requires a dealId.'];
  if (!hasText(data.accountId)) errors.accountId = ['RFQ creation requires an accountId.'];
  if (normalizedCommercialLines(data.lineItems).length === 0) {
    errors.lineItems = ['RFQ creation requires at least one normalized line item.'];
  }
  if (Object.keys(errors).length > 0) fieldErrors(errors);
}

function customFieldsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasApprovalPathMetadata(customFields: Record<string, unknown>) {
  return hasText(customFields.approvalPathId) || hasText(customFields.approvalPolicyId) || hasText(customFields.approverId);
}

// BL-01: "system migration mode" must be derived from a trusted, server-set
// signal on the request context — NOT from the client-supplied request body.
// The old client-body escape hatch (customFields.systemMigration) let any caller
// mint a quote with no RFQ and skip the approval gate simply by POSTing
// `{ customFields: { systemMigration: true } }`.
//
// Trusted signals available on EngineContext (all set server-side, never from the
// request body): `ctx.audit.source` is hard-coded per entrypoint — HTTP routes set
// 'api', internal consumers/jobs set 'system' | 'worker' | 'import' | 'automation';
// and `ctx.audit.actor.roles` comes from the verified JWT / service token.
const SYSTEM_MIGRATION_ROLES = new Set(['SYSTEM', 'SERVICE', 'service-role', 'MIGRATION']);
function isSystemMigrationContext(ctx: EngineContext): boolean {
  const source = ctx.audit.source;
  // Anything other than an external 'api' call is an internal/service path.
  if (source && source !== 'api') return true;
  const roles = actor(ctx).roles ?? [];
  return roles.some((role) => SYSTEM_MIGRATION_ROLES.has(role));
}

function quoteRevisionSnapshot(quote: Record<string, unknown>, overrides: Record<string, unknown>) {
  return JSON.parse(JSON.stringify({ ...quote, ...overrides })) as Prisma.InputJsonValue;
}

type CpqTransitionLedgerClient = {
  findUnique(args: Record<string, unknown>): Promise<{
    id: string;
    status: string;
    result: unknown;
    error: unknown;
  } | null>;
  findFirst(args: Record<string, unknown>): Promise<{
    id: string;
    status: string;
    result: unknown;
    error: unknown;
  } | null>;
  findMany?(args: Record<string, unknown>): Promise<Array<{
    id: string;
    tenantId?: string;
    entity?: string;
    entityId?: string;
    action?: string;
    status?: string;
    createdAt?: Date;
  }>>;
  create(args: Record<string, unknown>): Promise<{ id: string }>;
  update(args: Record<string, unknown>): Promise<unknown>;
};

function attachTransitionLedgerId<T>(value: T, transitionLedgerId: string): T {
  if (value && typeof value === 'object') {
    return { ...(value as Record<string, unknown>), transitionLedgerId } as T;
  }
  return value;
}

function cpqTransitionLedger(prisma: FinancePrisma): CpqTransitionLedgerClient | undefined {
  return (prisma as unknown as { cpqTransitionLedger?: CpqTransitionLedgerClient }).cpqTransitionLedger;
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function transitionResultStatus(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as Record<string, unknown>;
  if (hasText(row.status)) return String(row.status);
  for (const key of ['quote', 'discountRequest', 'order', 'rfq', 'revision']) {
    const nested = row[key];
    if (nested && typeof nested === 'object' && hasText((nested as Record<string, unknown>).status)) {
      return String((nested as Record<string, unknown>).status);
    }
  }
  return null;
}

function structuredError(error: unknown): Prisma.InputJsonValue {
  if (error instanceof Error) {
    const details = error instanceof NexusError ? error.details : undefined;
    return jsonSafe({
      name: error.name,
      message: error.message,
      details,
    });
  }
  return jsonSafe({ message: String(error) });
}

function transitionMetadata(meta: CpqTransitionMeta, transitionLedgerId?: string) {
  return compactPayload({
    transitionLedgerId,
    idempotencyKey: meta.idempotencyKey,
    correlationId: meta.correlationId,
    approvalRequestId: meta.approvalRequestId,
    sourceEventId: meta.sourceEventId,
    source: meta.source,
  });
}

// BL-04: allocate Order/RFQ numbers via the atomic DocumentSequence counter
// (race-free, gapless) instead of the old count()+1 read-then-write. Accepts any
// SqlRunner (base client or a $transaction client) so callers allocate inside the
// same transaction as the record insert.
async function generateOrderNumber(client: SqlRunner, tenantId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const seq = await allocateDocumentNumber(client, tenantId, 'order', String(year));
  return `ORD-${year}-${String(seq).padStart(5, '0')}`;
}

async function generateRfqNumber(client: SqlRunner, tenantId: string): Promise<string> {
  const seq = await allocateDocumentNumber(client, tenantId, 'rfq', 'ALL');
  return `RFQ-${String(seq).padStart(6, '0')}`;
}

function quoteApprovalMessage(check: Awaited<ReturnType<DiscountApprovalCheck>>) {
  return `Discount of ${check.actualDiscountPercent.toFixed(1)}% exceeds the ${check.thresholdPercent}% threshold. Approval request created.`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value: unknown, currency: string) {
  const n = Number(value ?? 0);
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

function quoteLines(quote: { lineItems: unknown }) {
  return Array.isArray(quote.lineItems) ? (quote.lineItems as Array<Record<string, unknown>>) : [];
}

function renderDefaultQuoteHtml(quote: Record<string, unknown>) {
  const currency = String(quote.currency ?? 'USD');
  const rows = quoteLines({ lineItems: quote.lineItems })
    .map((line) => {
      const qty = Number(line.quantity ?? 1);
      const unit = Number(line.unitPrice ?? 0);
      const total = Number(line.total ?? qty * unit);
      return `<tr>
        <td>${escapeHtml(line.productName ?? line.name ?? line.productId)}</td>
        <td>${escapeHtml(line.description ?? line.notes ?? '')}</td>
        <td class="num">${qty}</td>
        <td class="num">${formatMoney(unit, currency)}</td>
        <td class="num">${escapeHtml(line.discountPercent ?? 0)}%</td>
        <td class="num">${formatMoney(total, currency)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(quote.quoteNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; font-size: 12px; }
    .page { max-width: 820px; margin: 0 auto; padding: 32px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 16px; }
    .brand { font-size: 22px; font-weight: 800; color: #005baf; }
    .meta { text-align: right; line-height: 1.6; }
    h1 { font-size: 22px; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #dbe3ef; padding: 8px; vertical-align: top; }
    th { background: #f6f7f8; text-align: left; font-size: 11px; text-transform: uppercase; }
    .num { text-align: right; white-space: nowrap; }
    .summary { width: 320px; margin-left: auto; }
    .summary td { border: none; padding: 5px 0; }
    .summary .total { border-top: 1px solid #94a3b8; font-weight: 800; font-size: 14px; }
    .terms { margin-top: 28px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="brand">Nexus CRM</div>
        <div>Enterprise quote package</div>
      </div>
      <div class="meta">
        <div><strong>Quote:</strong> ${escapeHtml(quote.quoteNumber)}</div>
        <div><strong>Version:</strong> ${escapeHtml(quote.version)}</div>
        <div><strong>Expires:</strong> ${escapeHtml(String(quote.expiresAt ?? quote.validUntil ?? '-').slice(0, 10))}</div>
      </div>
    </div>
    <h1>${escapeHtml(quote.name)}</h1>
    <p>Account: ${escapeHtml(quote.accountId)} | Deal: ${escapeHtml(quote.dealId)}</p>
    <table>
      <thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Discount</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="summary">
      <tr><td>Subtotal</td><td class="num">${formatMoney(quote.subtotal, currency)}</td></tr>
      <tr><td>Discount</td><td class="num">${formatMoney(quote.discountAmount ?? quote.discountTotal, currency)}</td></tr>
      <tr><td>Tax</td><td class="num">${formatMoney(quote.taxAmount ?? quote.taxTotal, currency)}</td></tr>
      <tr class="total"><td>Total</td><td class="num">${formatMoney(quote.total, currency)}</td></tr>
    </table>
    <div class="terms">
      <h3>Terms</h3>
      <p>${escapeHtml(quote.terms ?? '')}</p>
      <h3>Notes</h3>
      <p>${escapeHtml(quote.notes ?? '')}</p>
    </div>
  </div>
</body>
</html>`;
}

function replaceTemplateVariables(template: string, quote: Record<string, unknown>) {
  return template.replaceAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = key.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object') return (current as Record<string, unknown>)[segment];
      return undefined;
    }, quote);
    return escapeHtml(value);
  });
}

async function buildQuoteDocumentContent(format: 'HTML' | 'PDF' | 'DOCX', renderedHtml: string, quote: Record<string, unknown>) {
  if (format === 'HTML') return Buffer.from(renderedHtml, 'utf8');
  if (format === 'DOCX') return buildQuoteDocxBuffer(quote);
  return generatePDF(renderedHtml);
}

function checksum(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function quoteDocumentContentType(format: 'HTML' | 'PDF' | 'DOCX') {
  if (format === 'DOCX') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (format === 'PDF') return 'application/pdf';
  return 'text/html';
}

function compactPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export function createCommercialRecordsUseCase(deps: CommercialRecordsUseCaseDeps) {
  const { prisma, producer, quotes, discountRequests, pricingEngine, checkDiscountApproval } = deps;

  async function emitCommercialEvent(
    ctx: EngineContext,
    input: {
      type: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      topic?: string;
    }
  ) {
    const tenantId = actor(ctx).tenantId;
    const topic = input.topic ?? TOPICS.QUOTES;
    const eventPayload = compactPayload({
      type: input.type,
      tenantId,
      occurredAt: ctx.now.toISOString(),
      actorId: actor(ctx).userId,
      ...input.payload,
    });
    const headers = {
      eventType: input.type,
      source: 'finance-service',
      tenantId,
      aggregateType: input.aggregateType,
    };

    await prisma.outboxMessage.create({
      data: {
        topic,
        key: input.aggregateId,
        payload: jsonSafe(eventPayload),
        tenantId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.type,
        correlationId: ctx.audit.correlationId ?? ctx.audit.requestId ?? input.type,
        headers: jsonSafe(headers),
        status: 'PENDING',
        retryCount: 0,
      },
    });

    await producer.publish(topic, {
      type: input.type,
      tenantId,
      payload: eventPayload,
    }).catch(() => undefined);
  }

  // ─── Quote-to-cash: create finance Subscription rows from a converted order ──
  // finance-service is the system-of-record for subscriptions. For every
  // recurring product on a converted order we create (idempotently) a
  // Subscription and emit `subscription.created` on TOPICS.CONTRACTS. All data
  // is guarded so missing/partial inputs never throw.
  async function createSubscriptionsForOrder(
    ctx: EngineContext,
    quote: {
      id: string;
      quoteNumber?: string | null;
      accountId: string;
      currency?: string | null;
      lineItems: unknown;
    },
    order: { id: string; orderNumber?: string | null; accountId: string; currency?: string | null }
  ): Promise<void> {
    const tenantId = actor(ctx).tenantId;
    const recurringLines = await resolveRecurringLines(prisma, tenantId, quote.lineItems);
    if (recurringLines.length === 0) return;

    const currency = String(order.currency ?? quote.currency ?? 'USD');
    // Next billing date defaults to one month out from the order date.
    const startDate = ctx.now;
    const nextBillingDate = new Date(startDate);
    nextBillingDate.setUTCMonth(nextBillingDate.getUTCMonth() + 1);

    for (const line of recurringLines) {
      const lineTotalPerPeriod = line.unitPrice * line.quantity;
      const mrr = Number((lineTotalPerPeriod * monthlyFactorFor(line.billingPeriod)).toFixed(2));
      const arr = Number((mrr * 12).toFixed(2));

      // Idempotency: skip if a subscription for this account+product already
      // exists (the schema enforces @@unique([tenantId, accountId, productId])).
      const existing = await prisma.subscription.findFirst({
        where: { tenantId, accountId: order.accountId, productId: line.productId },
      });
      if (existing) {
        const existingFields = customFieldsOf(existing.customFields);
        // Already linked to this order → nothing to do (idempotent replay).
        if (String(existingFields.sourceOrderId ?? '') === order.id) continue;
        // Belongs to another order → do not clobber; skip to stay additive.
        continue;
      }

      let subscription: Awaited<ReturnType<typeof prisma.subscription.create>>;
      try {
        subscription = await prisma.subscription.create({
          data: {
            tenantId,
            accountId: order.accountId,
            productId: line.productId,
            planName: line.productName,
            status: 'ACTIVE',
            quantity: line.quantity,
            unitPrice: new Prisma.Decimal(line.unitPrice),
            currency,
            billingPeriod: line.billingPeriod,
            billingDay: startDate.getUTCDate(),
            startDate,
            mrr: new Prisma.Decimal(mrr),
            arr: new Prisma.Decimal(arr),
            nextBillingDate,
            customFields: {
              sourceOrderId: order.id,
              sourceOrderNumber: order.orderNumber ?? null,
              sourceQuoteId: quote.id,
              sourceQuoteNumber: quote.quoteNumber ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        // Unique-constraint race (concurrent conversion) → treat as created.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }

      await emitCommercialEvent(ctx, {
        topic: TOPICS.CONTRACTS,
        type: 'subscription.created',
        aggregateType: 'subscription',
        aggregateId: subscription.id,
        payload: {
          subscriptionId: subscription.id,
          accountId: subscription.accountId,
          productId: subscription.productId,
          planName: subscription.planName,
          status: subscription.status,
          quantity: subscription.quantity,
          unitPrice: Number(subscription.unitPrice),
          currency: subscription.currency,
          billingPeriod: subscription.billingPeriod,
          mrr: Number(subscription.mrr),
          arr: Number(subscription.arr),
          startDate: subscription.startDate.toISOString(),
          nextBillingDate: subscription.nextBillingDate?.toISOString() ?? null,
          sourceOrderId: order.id,
          sourceOrderNumber: order.orderNumber ?? null,
          sourceQuoteId: quote.id,
          sourceQuoteNumber: quote.quoteNumber ?? null,
        },
      });
    }
  }

  async function persistCpqTransition<T>(
    ctx: EngineContext,
    input: CpqTransitionMeta & {
      entity: CpqEntity;
      entityId: string;
      action: string;
      previousStatus?: string | null;
      nextStatus?: string | null;
    },
    execute: (transitionLedgerId?: string) => Promise<T>
  ): Promise<T> {
    const ledger = cpqTransitionLedger(prisma);
    const tenantId = actor(ctx).tenantId;
    const idempotencyKey = input.idempotencyKey;
    if (!ledger || !hasText(idempotencyKey)) {
      return execute();
    }

    // Look the row up by its five scalar components (which ARE the members of
    // the `@@unique([tenantId, entity, entityId, action, idempotencyKey])`), via
    // findFirst rather than findUnique's compound-key locator. The generated
    // Prisma client's runtime intermittently fails to resolve that compound
    // unique key (rejects it as an "unknown argument"), which 500'd EVERY CPQ
    // state transition — the entire quote-to-cash write path. Scalar filters are
    // always valid and select the same single row.
    const existing = await ledger.findFirst({
      where: {
        tenantId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        idempotencyKey,
      },
    });
    if (existing?.status === 'SUCCEEDED') {
      return existing.result as T;
    }
    if (existing?.status === 'STARTED') {
      throw new BusinessRuleError('CPQ transition is already in progress', { ledgerId: existing.id });
    }
    if (existing?.status === 'FAILED') {
      throw new BusinessRuleError('CPQ transition previously failed', { ledgerId: existing.id, error: existing.error });
    }

    const started = await ledger.create({
      data: {
        tenantId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        idempotencyKey,
        correlationId: input.correlationId ?? ctx.audit.correlationId ?? ctx.audit.requestId ?? null,
        actorId: actor(ctx).userId,
        source: input.source ?? ctx.audit.source ?? null,
        sourceEventId: input.sourceEventId ?? null,
        approvalRequestId: input.approvalRequestId ?? null,
        previousStatus: input.previousStatus ?? null,
        nextStatus: null,
        status: 'STARTED',
      },
    });

    try {
      const result = attachTransitionLedgerId(await execute(started.id), started.id);
      await ledger.update({
        where: { id: started.id },
        data: {
          status: 'SUCCEEDED',
          nextStatus: input.nextStatus ?? transitionResultStatus(result),
          result: jsonSafe(result),
        },
      });
      return result;
    } catch (error) {
      await ledger.update({
        where: { id: started.id },
        data: {
          status: 'FAILED',
          error: structuredError(error),
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  async function transitionCpqEntity(command: CpqTransitionCommand) {
    if (!hasText(command.tenantId)) {
      throw new BusinessRuleError('CPQ transition requires tenant scope');
    }
    if (!hasText(command.actorId)) {
      throw new BusinessRuleError('CPQ transition requires actor scope');
    }

    if (command.entity === 'rfq' && [
      'SUBMIT_FOR_REVIEW',
      'START_REVIEW',
      'RETURN_FOR_CHANGES',
      'MARK_READY_FOR_QUOTE',
      'RECORD_RESPONSE',
      'CANCEL',
      'CONVERT_TO_QUOTE',
    ].includes(command.action)) {
      const rfq = await prisma.rFQ.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!rfq) throw new NotFoundError('RFQ', command.entityId);
      if (command.action === 'SUBMIT_FOR_REVIEW' && !['DRAFT'].includes(String(rfq.status))) {
        throw new BusinessRuleError(`RFQ cannot be submitted for review from status ${rfq.status}`);
      }
      if (command.action === 'START_REVIEW' && rfq.status !== 'SENT') {
        throw new BusinessRuleError(`RFQ review can only start from SENT status (current: ${rfq.status})`);
      }
      if (command.action === 'RETURN_FOR_CHANGES') {
        if (!['SENT', 'REVIEWING'].includes(String(rfq.status))) {
          throw new BusinessRuleError(`RFQ cannot be returned from status ${rfq.status}`);
        }
        if (!hasText(command.payload?.reason)) {
          throw new BusinessRuleError('RFQ return requires a reason');
        }
      }
      if (command.action === 'MARK_READY_FOR_QUOTE' && rfq.status !== 'REVIEWING') {
        throw new BusinessRuleError(`RFQ can only be marked ready from REVIEWING status (current: ${rfq.status})`);
      }
      if (command.action === 'RECORD_RESPONSE' && !['SENT', 'REVIEWING'].includes(String(rfq.status))) {
        throw new BusinessRuleError(`RFQ response cannot be recorded from status ${rfq.status}`);
      }
      if (command.action === 'CANCEL') {
        if (['CONVERTED', 'CANCELLED'].includes(String(rfq.status))) {
          throw new BusinessRuleError(`RFQ cannot be cancelled from status ${rfq.status}`);
        }
        if (!hasText(command.payload?.reason)) {
          throw new BusinessRuleError('RFQ cancellation requires a reason');
        }
      }
      if (command.action === 'CONVERT_TO_QUOTE' && !RFQ_CONVERTIBLE_STATUSES.has(String(rfq.status))) {
        throw new BusinessRuleError(`RFQ must be reviewed/responded before quote conversion (current: ${rfq.status})`);
      }
      if (['SUBMIT_FOR_REVIEW', 'MARK_READY_FOR_QUOTE', 'CONVERT_TO_QUOTE'].includes(command.action) && (!rfq.accountId || !rfq.dealId)) {
        throw new BusinessRuleError('RFQ must be linked to an account and deal before this transition');
      }
      if (['SUBMIT_FOR_REVIEW', 'MARK_READY_FOR_QUOTE', 'CONVERT_TO_QUOTE'].includes(command.action) && normalizedCommercialLines(rfq.lineItems).length === 0) {
        throw new BusinessRuleError('RFQ transition requires at least one valid product line');
      }
      return rfq;
    }

    if (command.entity === 'quote' && command.action === 'CONVERT_TO_ORDER') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (!['ACCEPTED'].includes(quote.status)) {
        throw new BusinessRuleError('Only accepted/signed quotes can be converted to orders');
      }
      if (quote.expiresAt && quote.expiresAt.getTime() <= ctxDate(command).getTime()) {
        throw new BusinessRuleError('Expired quotes cannot be converted to orders');
      }
      if (quote.approvalRequired && quote.approvalStatus !== 'APPROVED') {
        throw new BusinessRuleError('Quote approval must be completed before order conversion');
      }
      const latestRevision = await prisma.quoteRevision.findFirst({
        where: { tenantId: command.tenantId, quoteId: quote.id },
        orderBy: { version: 'desc' },
      });
      if (!latestRevision || latestRevision.version !== quote.version || latestRevision.status !== quote.status) {
        throw new BusinessRuleError('Quote revision is stale, superseded, or missing');
      }
      if (['VOID', 'EXPIRED', 'CONVERTED', 'REJECTED'].includes(String(latestRevision.status))) {
        throw new BusinessRuleError(`Quote revision ${latestRevision.version} cannot be converted in status ${latestRevision.status}`);
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'SUBMIT_FOR_APPROVAL') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (!['DRAFT'].includes(quote.status)) {
        throw new BusinessRuleError(`Quote cannot be submitted for approval from status ${quote.status}`);
      }
      const customFields = customFieldsOf(quote.customFields);
      if (!hasApprovalPathMetadata(customFields) && !hasText(command.payload?.approvalRequestId)) {
        throw new BusinessRuleError('Quote approval submission requires approval policy or approval request reference');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'APPROVE') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (quote.status !== 'PENDING_APPROVAL') {
        throw new BusinessRuleError(`Quote approval requires PENDING_APPROVAL status (current: ${quote.status})`);
      }
      if (!hasText(command.payload?.approvalRequestId) && !hasText(command.payload?.systemAuthority)) {
        throw new BusinessRuleError('Quote approval requires approval request reference');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'REJECT') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      const customerRejection = command.payload?.customerRejection === true;
      if (customerRejection && !['SENT', 'VIEWED'].includes(quote.status)) {
        throw new BusinessRuleError(`Customer quote rejection requires sent/viewed status (current: ${quote.status})`);
      }
      if (!customerRejection && quote.status !== 'PENDING_APPROVAL') {
        throw new BusinessRuleError(`Quote rejection requires PENDING_APPROVAL status (current: ${quote.status})`);
      }
      if (!hasText(command.payload?.rejectionReason)) {
        throw new BusinessRuleError('Quote rejection requires a rejection reason');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'ACCEPT') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (!['SENT', 'VIEWED'].includes(quote.status)) {
        throw new BusinessRuleError(`Quote acceptance requires sent/viewed status (current: ${quote.status})`);
      }
      if (quote.expiresAt && quote.expiresAt.getTime() <= ctxDate(command).getTime()) {
        throw new BusinessRuleError('Expired quotes cannot be accepted');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'VOID') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (!['DRAFT', 'SENT', 'VIEWED'].includes(quote.status)) {
        throw new BusinessRuleError(`Quote void requires draft/sent/viewed status (current: ${quote.status})`);
      }
      if (!hasText(command.payload?.reason)) {
        throw new BusinessRuleError('Quote void requires a reason');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'EXPIRE') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      const activeCustomerFacingStatuses = new Set(['APPROVED', 'SENT', 'VIEWED']);
      const finalStatuses = new Set(['SIGNED', 'ACCEPTED', 'CONVERTED', 'CONVERTED_TO_ORDER', 'VOID', 'SUPERSEDED', 'EXPIRED', 'REJECTED']);
      if (finalStatuses.has(String(quote.status))) {
        throw new BusinessRuleError(`Quote expiry is blocked for final status ${quote.status}`);
      }
      if (!activeCustomerFacingStatuses.has(String(quote.status))) {
        throw new BusinessRuleError(`Quote expiry requires approved/sent/viewed status (current: ${quote.status})`);
      }
      const latestRevision = await prisma.quoteRevision.findFirst({
        where: { tenantId: command.tenantId, quoteId: quote.id },
        orderBy: { version: 'desc' },
      });
      if (!latestRevision || latestRevision.version !== quote.version) {
        throw new BusinessRuleError('Quote revision is stale, superseded, or missing');
      }
      const expiry = quote.expiresAt ?? quote.validUntil;
      const force = command.payload?.force === true;
      const systemOrAdminAuthority = command.actorId === 'system'
        || hasText(command.payload?.systemAuthority)
        || command.payload?.adminOverride === true;
      if ((!expiry || expiry.getTime() > ctxDate(command).getTime()) && !(force && systemOrAdminAuthority)) {
        throw new BusinessRuleError('Quote cannot be expired before its expiry date');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'SEND_TO_CUSTOMER') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (!['APPROVED'].includes(quote.status)) {
        throw new BusinessRuleError(`Quote cannot be sent before approval (current: ${quote.status})`);
      }
      if (quote.expiresAt && quote.expiresAt.getTime() <= ctxDate(command).getTime()) {
        throw new BusinessRuleError('Expired quotes cannot be sent');
      }
      const latestRevision = await prisma.quoteRevision.findFirst({
        where: { tenantId: command.tenantId, quoteId: quote.id },
        orderBy: { version: 'desc' },
      });
      if (!latestRevision || latestRevision.version !== quote.version || latestRevision.status !== quote.status) {
        throw new BusinessRuleError('Quote revision is stale, superseded, or missing');
      }
      const rendered = await prisma.quoteDocument.findFirst({
        where: { tenantId: command.tenantId, quoteId: quote.id, status: 'RENDERED' },
        orderBy: { createdAt: 'desc' },
      });
      if (!rendered) {
        throw new BusinessRuleError('Quote must have a rendered customer package before sending');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'REQUEST_SIGNATURE') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (!['SENT', 'APPROVED'].includes(quote.status)) {
        throw new BusinessRuleError(`Quote signature request requires sent or approved status (current: ${quote.status})`);
      }
      if (quote.expiresAt && quote.expiresAt.getTime() <= ctxDate(command).getTime()) {
        throw new BusinessRuleError('Expired quotes cannot be sent for signature');
      }
      return quote;
    }

    if (command.entity === 'quote' && command.action === 'MARK_SIGNED') {
      const quote = await prisma.quote.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!quote) throw new NotFoundError('Quote', command.entityId);
      if (!['SENT', 'VIEWED'].includes(quote.status)) {
        throw new BusinessRuleError(`Quote signature completion requires sent/viewed status (current: ${quote.status})`);
      }
      return quote;
    }

    if (command.entity === 'drq' && ['SUBMIT_FOR_APPROVAL', 'APPROVE', 'REJECT', 'APPLY_TO_QUOTE_REVISION'].includes(command.action)) {
      const request = await prisma.discountRequest.findFirst({ where: { id: command.entityId, tenantId: command.tenantId } });
      if (!request) throw new NotFoundError('DiscountRequest', command.entityId);
      const customFields = customFieldsOf(request.customFields);
      const quoteRevisionId = String(command.payload?.quoteRevisionId ?? customFields.quoteRevisionId ?? '');
      if (!hasText(quoteRevisionId)) {
        throw new BusinessRuleError('DRQ transition requires quoteRevisionId');
      }
      if (command.action === 'SUBMIT_FOR_APPROVAL' && !['DRAFT', 'PENDING'].includes(request.status)) {
        throw new BusinessRuleError(`DRQ cannot be submitted from status ${request.status}`);
      }
      if (command.action === 'SUBMIT_FOR_APPROVAL') {
        if (Number(request.requestedDiscountPercent) <= 0) {
          throw new BusinessRuleError('DRQ submit requires a discount percent');
        }
        if (!hasText(request.reasonCode)) {
          throw new BusinessRuleError('DRQ submit requires a reason code');
        }
        if (!hasText(request.reasonNotes)) {
          throw new BusinessRuleError('DRQ submit requires reason notes');
        }
        if (request.winningProbabilityIfApproved === null || request.winningProbabilityIfApproved === undefined) {
          throw new BusinessRuleError('DRQ submit requires winning probability');
        }
        const quote = await prisma.quote.findFirst({ where: { id: request.quoteId, tenantId: command.tenantId } });
        if (!quote) throw new NotFoundError('Quote', request.quoteId);
        const revision = await prisma.quoteRevision.findFirst({
          where: { id: quoteRevisionId, tenantId: command.tenantId, quoteId: quote.id },
        });
        if (!revision || revision.version !== quote.version) {
          throw new BusinessRuleError('DRQ quote revision is stale, superseded, or missing');
        }
      }
      if (command.action === 'APPROVE' && request.status !== 'PENDING') {
        throw new BusinessRuleError(`DRQ approval requires PENDING status (current: ${request.status})`);
      }
      if (command.action === 'REJECT') {
        if (request.status !== 'PENDING') {
          throw new BusinessRuleError(`DRQ rejection requires PENDING status (current: ${request.status})`);
        }
        if (!hasText(command.payload?.rejectionReason)) {
          throw new BusinessRuleError('DRQ rejection requires a rejection reason');
        }
      }
      if (command.action === 'APPLY_TO_QUOTE_REVISION' && request.status !== 'APPROVED') {
        throw new BusinessRuleError(`DRQ must be approved before applying to a quote revision (current: ${request.status})`);
      }
      return request;
    }

    return null;
  }

  function ctxDate(command: CpqTransitionCommand) {
    const at = command.payload?.now;
    return at instanceof Date ? at : new Date();
  }

  function expiryBucket(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  async function transitionRfq(
    ctx: EngineContext,
    id: string,
    action: string,
    nextStatus: string,
    eventType: string,
    meta: CpqTransitionMeta = {},
    payload: Record<string, unknown> = {}
  ) {
    const tenantId = actor(ctx).tenantId;
    return persistCpqTransition(ctx, {
      entity: 'rfq',
      entityId: id,
      action,
      nextStatus,
      ...meta,
    }, async (transitionLedgerId) => {
      const rfq = await transitionCpqEntity({
        tenantId,
        actorId: actor(ctx).userId,
        entity: 'rfq',
        entityId: id,
        action,
        idempotencyKey: meta.idempotencyKey,
        payload: { now: ctx.now, ...payload },
      }) as Awaited<ReturnType<typeof prisma.rFQ.findFirst>>;
      if (!rfq) throw new NotFoundError('RFQ', id);
      const updateData: Prisma.RFQUpdateInput = { status: nextStatus as never };
      if (hasText(payload.reason)) {
        updateData.internalNotes = `${rfq.internalNotes ? `${rfq.internalNotes}\n` : ''}${action}: ${String(payload.reason)}`;
      }
      if (payload.response && typeof payload.response === 'object') {
        const currentResponses = Array.isArray(rfq.vendorResponses) ? rfq.vendorResponses : [];
        updateData.vendorResponses = [
          { ...(payload.response as Record<string, unknown>), recordedById: actor(ctx).userId, recordedAt: ctx.now.toISOString() },
          ...currentResponses,
        ] as Prisma.InputJsonValue;
      }
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: updateData,
      });
      await emitCommercialEvent(ctx, {
        type: eventType,
        aggregateType: 'rfq',
        aggregateId: rfq.id,
        payload: {
          rfqId: rfq.id,
          rfqNumber: rfq.rfqNumber,
          accountId: rfq.accountId,
          contactId: rfq.contactId,
          dealId: rfq.dealId,
          previousStatus: rfq.status,
          status: nextStatus,
          reason: payload.reason,
          metadata: transitionMetadata(meta, transitionLedgerId),
        },
      });
      return updated;
    });
  }

  return {
    transitionCpqEntity,

    /**
     * Direct, level-aware manager approval of a quote sitting in PENDING_APPROVAL.
     * Advances `approvalLevel` by one; only once it reaches `requiredApprovalLevel`
     * does the quote flip to APPROVED (and become sendable). Multi-tier quotes need
     * one call per level (each from a `quotes:approve` holder). This is the in-app
     * counterpart to `approveQuoteFromApproval`, which is driven by the external
     * approval-service workflow.
     */
    async approveQuoteLevel(ctx: EngineContext, id: string) {
      const tenantId = actor(ctx).tenantId;
      const userId = actor(ctx).userId;
      const quote = await prisma.quote.findFirst({ where: { id, tenantId } });
      if (!quote) throw new NotFoundError('Quote', id);
      if (quote.status !== 'PENDING_APPROVAL') {
        throw new BusinessRuleError(
          `Only quotes pending approval can be approved (current status: ${quote.status})`
        );
      }
      const required = Number(quote.requiredApprovalLevel ?? 0);
      const nextLevel = Number(quote.approvalLevel ?? 0) + 1;
      const fullyApproved = nextLevel >= required;
      const nextVersion = Number(quote.version ?? 1) + 1;
      const updated = await prisma.quote.update({
        where: { id: quote.id },
        data: {
          approvalLevel: nextLevel,
          status: fullyApproved ? 'APPROVED' : 'PENDING_APPROVAL',
          approvalStatus: fullyApproved ? 'APPROVED' : 'PENDING',
          approvedById: fullyApproved ? userId : quote.approvedById,
          approvedAt: fullyApproved ? ctx.now : quote.approvedAt,
          version: nextVersion,
        },
      });
      await prisma.quoteRevision
        .create({
          data: {
            tenantId,
            quoteId: quote.id,
            version: nextVersion,
            reason: fullyApproved ? 'quote.approved' : 'quote.approval.level',
            status: updated.status,
            snapshot: quoteRevisionSnapshot(quote as unknown as Record<string, unknown>, {
              status: updated.status,
              approvalStatus: updated.approvalStatus,
              approvalLevel: nextLevel,
              requiredApprovalLevel: required,
              approvedById: userId,
              version: nextVersion,
            }),
            createdById: userId,
          },
        })
        .catch((err: unknown) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return undefined;
          throw err;
        });
      await emitCommercialEvent(ctx, {
        type: fullyApproved ? 'quote.approved' : 'quote.approval.advanced',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          approvalLevel: nextLevel,
          requiredApprovalLevel: required,
          status: updated.status,
          approvedById: userId,
        },
      });
      return updated;
    },

    async approveQuoteFromApproval(ctx: EngineContext, quoteId: string, input: ApprovalTransitionInput) {
      const tenantId = actor(ctx).tenantId;
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: quoteId,
        action: 'APPROVE',
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        source: 'approval-service',
        sourceEventId: input.sourceEventId,
        approvalRequestId: input.approvalRequestId,
        nextStatus: 'APPROVED',
      }, async (transitionLedgerId) => {
        const quote = await transitionCpqEntity({
          tenantId,
          actorId: input.approvedById ?? actor(ctx).userId,
          entity: 'quote',
          entityId: quoteId,
          action: 'APPROVE',
          idempotencyKey: input.idempotencyKey,
          payload: {
            now: ctx.now,
            approvalRequestId: input.approvalRequestId,
            systemAuthority: 'approval-service',
          },
        }) as Awaited<ReturnType<typeof prisma.quote.findFirst>>;
        if (!quote) throw new NotFoundError('Quote', quoteId);
        if (quote.status === 'APPROVED') return quote;
        const nextVersion = Number(quote.version ?? 1) + 1;
        const updated = await prisma.quote.update({
          where: { id: quote.id },
          data: {
            status: 'APPROVED',
            approvalStatus: 'APPROVED',
            approvedById: input.approvedById ?? actor(ctx).userId,
            approvedAt: ctx.now,
            version: nextVersion,
          },
        });
        await prisma.quoteRevision.create({
          data: {
            tenantId,
            quoteId: quote.id,
            version: nextVersion,
            reason: 'quote.approved',
            status: 'APPROVED',
            snapshot: quoteRevisionSnapshot(quote as unknown as Record<string, unknown>, {
              status: 'APPROVED',
              approvalStatus: 'APPROVED',
              approvedAt: ctx.now.toISOString(),
              approvalRequestId: input.approvalRequestId ?? null,
              version: nextVersion,
            }),
            createdById: input.approvedById ?? actor(ctx).userId,
          },
        }).catch((err: unknown) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return undefined;
          throw err;
        });
        await emitCommercialEvent(ctx, {
          type: 'quote.approved',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            approvalRequestId: input.approvalRequestId,
            previousStatus: quote.status,
            status: 'APPROVED',
            metadata: transitionMetadata({ ...input, source: 'approval-service' }, transitionLedgerId),
          },
        });
        return updated;
      });
    },

    async rejectQuoteFromApproval(ctx: EngineContext, quoteId: string, input: ApprovalTransitionInput) {
      const tenantId = actor(ctx).tenantId;
      const reason = input.rejectionReason ?? 'Rejected by approval workflow';
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: quoteId,
        action: 'REJECT',
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        source: 'approval-service',
        sourceEventId: input.sourceEventId,
        approvalRequestId: input.approvalRequestId,
        nextStatus: 'REJECTED',
      }, async (transitionLedgerId) => {
      const quote = await transitionCpqEntity({
        tenantId,
        actorId: input.rejectedById ?? actor(ctx).userId,
        entity: 'quote',
        entityId: quoteId,
        action: 'REJECT',
        idempotencyKey: input.idempotencyKey,
        payload: {
          now: ctx.now,
          approvalRequestId: input.approvalRequestId,
          rejectionReason: reason,
          systemAuthority: 'approval-service',
        },
      }) as Awaited<ReturnType<typeof prisma.quote.findFirst>>;
      if (!quote) throw new NotFoundError('Quote', quoteId);
      if (quote.status === 'REJECTED') return quote;
      const updated = await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'REJECTED',
          approvalStatus: 'REJECTED',
          rejectedAt: ctx.now,
          rejectionReason: reason,
          version: { increment: 1 },
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'quote.rejected',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          approvalRequestId: input.approvalRequestId,
          previousStatus: quote.status,
          status: 'REJECTED',
          reason,
          metadata: transitionMetadata({ ...input, source: 'approval-service' }, transitionLedgerId),
        },
      });
      return updated;
      });
    },

    async submitQuoteForApproval(ctx: EngineContext, quoteId: string, input: ApprovalTransitionInput) {
      const tenantId = actor(ctx).tenantId;
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: quoteId,
        action: 'SUBMIT_FOR_APPROVAL',
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        source: ctx.audit.source,
        sourceEventId: input.sourceEventId,
        approvalRequestId: input.approvalRequestId,
        nextStatus: 'PENDING_APPROVAL',
      }, async (transitionLedgerId) => {
      const quote = await transitionCpqEntity({
        tenantId,
        actorId: actor(ctx).userId,
        entity: 'quote',
        entityId: quoteId,
        action: 'SUBMIT_FOR_APPROVAL',
        idempotencyKey: input.idempotencyKey,
        payload: {
          now: ctx.now,
          approvalRequestId: input.approvalRequestId,
        },
      }) as Awaited<ReturnType<typeof prisma.quote.findFirst>>;
      if (!quote) throw new NotFoundError('Quote', quoteId);
      const updated = await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'PENDING_APPROVAL',
          approvalRequired: true,
          approvalStatus: 'PENDING',
          pricingBreakdown: {
            ...customFieldsOf(quote.pricingBreakdown),
            approvalRequestId: input.approvalRequestId ?? null,
          } as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'quote.submitted_for_approval',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          approvalRequestId: input.approvalRequestId,
          previousStatus: quote.status,
          status: 'PENDING_APPROVAL',
          metadata: transitionMetadata(input, transitionLedgerId),
        },
      });
      return updated;
      });
    },

    async submitDiscountRequestForApproval(ctx: EngineContext, discountRequestId: string, input: ApprovalTransitionInput) {
      const tenantId = actor(ctx).tenantId;
      return persistCpqTransition(ctx, {
        entity: 'drq',
        entityId: discountRequestId,
        action: 'SUBMIT_FOR_APPROVAL',
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        source: ctx.audit.source,
        sourceEventId: input.sourceEventId,
        approvalRequestId: input.approvalRequestId,
        nextStatus: 'PENDING',
      }, async (transitionLedgerId) => {
      const request = await transitionCpqEntity({
        tenantId,
        actorId: actor(ctx).userId,
        entity: 'drq',
        entityId: discountRequestId,
        action: 'SUBMIT_FOR_APPROVAL',
        idempotencyKey: input.idempotencyKey,
        payload: {
          now: ctx.now,
          approvalRequestId: input.approvalRequestId,
        },
      }) as Awaited<ReturnType<typeof prisma.discountRequest.findFirst>>;
      if (!request) throw new NotFoundError('DiscountRequest', discountRequestId);
      const approvalRequestId = input.approvalRequestId ?? request.approvalRequestId;
      if (!hasText(approvalRequestId)) {
        throw new BusinessRuleError('DRQ submit requires an approval request reference');
      }
      const requestCustomFields = customFieldsOf(request.customFields);
      const updated = await prisma.discountRequest.update({
        where: { id: request.id },
        data: {
          status: 'PENDING',
          approvalRequestId,
          customFields: {
            ...requestCustomFields,
            approvalRequestId,
            submittedAt: ctx.now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'drq.requested',
        aggregateType: 'discount_request',
        aggregateId: request.id,
        payload: {
          discountRequestId: request.id,
          quoteId: request.quoteId,
          quoteRevisionId: requestCustomFields.quoteRevisionId,
          approvalRequestId,
          requestedById: request.requestedById,
          reasonCode: request.reasonCode,
          reasonNotes: request.reasonNotes,
          requestedDiscountPercent: Number(request.requestedDiscountPercent),
          winningProbabilityIfApproved: request.winningProbabilityIfApproved,
          previousStatus: request.status,
          status: 'PENDING',
          metadata: transitionMetadata(input, transitionLedgerId),
        },
      });
      return updated;
      });
    },

    async approveDiscountRequestFromApproval(ctx: EngineContext, discountRequestId: string, input: ApprovalTransitionInput) {
      const tenantId = actor(ctx).tenantId;
      return persistCpqTransition(ctx, {
        entity: 'drq',
        entityId: discountRequestId,
        action: 'APPROVE',
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        source: 'approval-service',
        sourceEventId: input.sourceEventId,
        approvalRequestId: input.approvalRequestId,
        nextStatus: 'APPROVED',
      }, async (transitionLedgerId) => {
      const request = await transitionCpqEntity({
        tenantId,
        actorId: input.approvedById ?? actor(ctx).userId,
        entity: 'drq',
        entityId: discountRequestId,
        action: 'APPROVE',
        idempotencyKey: input.idempotencyKey,
        payload: {
          now: ctx.now,
          approvalRequestId: input.approvalRequestId,
          systemAuthority: 'approval-service',
        },
      }) as Awaited<ReturnType<typeof prisma.discountRequest.findFirst>>;
      if (!request) throw new NotFoundError('DiscountRequest', discountRequestId);
      const customFields = customFieldsOf(request.customFields);
      const quoteRevisionId = String(customFields.quoteRevisionId ?? '');
      const quote = await prisma.quote.findFirst({ where: { id: request.quoteId, tenantId } });
      if (!quote) throw new NotFoundError('Quote', request.quoteId);
      const revision = await prisma.quoteRevision.findFirst({
        where: { id: quoteRevisionId, tenantId, quoteId: quote.id },
      });
      if (!revision || revision.version !== quote.version) {
        throw new BusinessRuleError('DRQ quote revision is stale, superseded, or missing');
      }
      const approvedRequest = await prisma.discountRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          approvedById: input.approvedById ?? actor(ctx).userId,
          approvedAt: ctx.now,
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'drq.approved',
        aggregateType: 'discount_request',
        aggregateId: request.id,
        payload: {
          discountRequestId: request.id,
          quoteId: quote.id,
          approvalRequestId: input.approvalRequestId,
          requestedDiscountPercent: Number(request.requestedDiscountPercent),
          metadata: transitionMetadata({ ...input, source: 'approval-service' }, transitionLedgerId),
        },
      });

      const nextVersion = Number(quote.version ?? 1) + 1;
      const requestedDiscountAmount = Number(request.requestedDiscountAmount ?? 0);
      const nextTotal = Number(quote.subtotal) - requestedDiscountAmount + Number(quote.taxAmount);
      const updatedQuote = await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'DRAFT',
          approvalRequired: false,
          approvalStatus: null,
          discountAmount: new Prisma.Decimal(requestedDiscountAmount),
          total: new Prisma.Decimal(nextTotal),
          version: nextVersion,
          pricingBreakdown: {
            ...(quote.pricingBreakdown as Record<string, unknown>),
            appliedDiscountRequestId: request.id,
            renderedPackageInvalidatedAt: ctx.now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      const createdRevision = await prisma.quoteRevision.create({
        data: {
          tenantId,
          quoteId: quote.id,
          version: nextVersion,
          reason: 'discount_request.approved',
          status: updatedQuote.status,
          snapshot: quoteRevisionSnapshot(quote as unknown as Record<string, unknown>, {
            status: updatedQuote.status,
            version: nextVersion,
            discountAmount: String(requestedDiscountAmount),
            total: String(nextTotal),
            discountRequestId: request.id,
            approvalRequestId: input.approvalRequestId ?? null,
          }),
          createdById: input.approvedById ?? actor(ctx).userId,
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'quote.revision_created',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteRevisionId: createdRevision.id,
          version: nextVersion,
          discountRequestId: request.id,
          metadata: transitionMetadata({ ...input, source: 'approval-service' }, transitionLedgerId),
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'quote.revised_from_drq',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          version: nextVersion,
          discountRequestId: request.id,
          metadata: transitionMetadata({ ...input, source: 'approval-service' }, transitionLedgerId),
        },
      });
      return { discountRequest: approvedRequest, quote: updatedQuote, revision: createdRevision };
      });
    },

    async rejectDiscountRequestFromApproval(ctx: EngineContext, discountRequestId: string, input: ApprovalTransitionInput) {
      const tenantId = actor(ctx).tenantId;
      const reason = input.rejectionReason ?? 'Rejected by approval workflow';
      return persistCpqTransition(ctx, {
        entity: 'drq',
        entityId: discountRequestId,
        action: 'REJECT',
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        source: 'approval-service',
        sourceEventId: input.sourceEventId,
        approvalRequestId: input.approvalRequestId,
        nextStatus: 'REJECTED',
      }, async (transitionLedgerId) => {
      const request = await transitionCpqEntity({
        tenantId,
        actorId: input.rejectedById ?? actor(ctx).userId,
        entity: 'drq',
        entityId: discountRequestId,
        action: 'REJECT',
        idempotencyKey: input.idempotencyKey,
        payload: {
          now: ctx.now,
          approvalRequestId: input.approvalRequestId,
          rejectionReason: reason,
          systemAuthority: 'approval-service',
        },
      }) as Awaited<ReturnType<typeof prisma.discountRequest.findFirst>>;
      if (!request) throw new NotFoundError('DiscountRequest', discountRequestId);
      const updated = await prisma.discountRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          rejectedById: input.rejectedById ?? actor(ctx).userId,
          rejectedAt: ctx.now,
          rejectionReason: reason,
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'drq.rejected',
        aggregateType: 'discount_request',
        aggregateId: request.id,
        payload: {
          discountRequestId: request.id,
          quoteId: request.quoteId,
          approvalRequestId: input.approvalRequestId,
          reason,
          metadata: transitionMetadata({ ...input, source: 'approval-service' }, transitionLedgerId),
        },
      });
      return updated;
      });
    },

    async listQuotes(ctx: EngineContext, query: QuoteListQuery) {
      const tenantId = actor(ctx).tenantId;
      return quotes.listQuotes(
        tenantId,
        {
          dealId: query.dealId,
          accountId: query.accountId,
          ownerId: query.ownerId,
          status: query.status,
        },
        { page: query.page, limit: query.limit, sortDir: query.sortDir }
      );
    },

    async createQuote(ctx: EngineContext, data: CreateQuoteInput) {
      const tenantId = actor(ctx).tenantId;
      const customFields = customFieldsOf(data.customFields);
      const systemMigration = isSystemMigrationContext(ctx);
      if (!data.rfqId && !systemMigration) {
        throw new BusinessRuleError('Quote creation must originate from an RFQ');
      }
      if (!hasText(data.dealId) || !hasText(data.accountId) || !hasText(data.ownerId)) {
        throw new BusinessRuleError('Quote creation requires dealId, accountId, tenantId, and actorId');
      }
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new BusinessRuleError('Quote creation requires at least one line item');
      }
      if (!hasApprovalPathMetadata(customFields) && !systemMigration) {
        throw new BusinessRuleError('Quote creation requires approval path metadata or a resolvable approval policy');
      }
      if (data.rfqId) {
        const rfq = await prisma.rFQ.findFirst({ where: { id: data.rfqId, tenantId } });
        if (!rfq) throw new NotFoundError('RFQ', data.rfqId);
        if (!RFQ_CONVERTIBLE_STATUSES.has(String(rfq.status))) {
          throw new BusinessRuleError(`RFQ must be reviewed/responded before quote creation (current: ${rfq.status})`);
        }
        if (rfq.dealId !== data.dealId || rfq.accountId !== data.accountId) {
          throw new BusinessRuleError('Quote commercial anchors must match the source RFQ');
        }
      }
      // Price Books (feature 1): threaded when supplied on the create payload.
      const priceBookId = (data as { priceBookId?: string | null }).priceBookId ?? null;
      const pricing = await pricingEngine.calculate({
        tenantId,
        dealId: data.dealId,
        accountId: data.accountId,
        currency: data.currency,
        paymentTerms: data.paymentTerms,
        appliedPromos: data.appliedPromos,
        items: data.items,
        priceBookId,
      });

      if (pricing.approvalRequired && !data.discountRequest) {
        throw new ValidationError('Discount request is required', {
          fieldErrors: {
            discountRequest: [
              'A prevalidated discount reason and winning probability are required when CPQ flags approval.',
            ],
          },
          formErrors: [],
        });
      }

      const quote = await quotes.createQuote(
        tenantId,
        { ...data, priceBookId },
        pricing
      );
      const discountRequest =
        pricing.approvalRequired && data.discountRequest
          ? await discountRequests.createDiscountRequest(
              tenantId,
              {
                quoteId: quote.id,
                requestedById: data.ownerId,
                ...data.discountRequest,
                quoteRevisionId: data.discountRequest.quoteRevisionId ?? (await prisma.quoteRevision.findFirst({
                  where: { tenantId, quoteId: quote.id },
                  orderBy: { version: 'desc' },
                }))?.id ?? '',
              },
              actor(ctx).userId
            )
          : null;

      await emitCommercialEvent(ctx, {
        type: 'quote.created',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          status: quote.status,
          total: Number(quote.total.toFixed(2)),
          currency: quote.currency,
          approvalRequired: quote.approvalRequired,
          discountRequestId: discountRequest ? (discountRequest as { id?: string }).id : undefined,
        },
      });

      return { quote, pricing, discountRequest };
    },

    async getQuote(ctx: EngineContext, id: string) {
      return quotes.getQuoteById(actor(ctx).tenantId, id);
    },

    async listArchivedQuotes(ctx: EngineContext, query: QuoteListQuery) {
      const tenantId = actor(ctx).tenantId;
      return quotes.listArchivedQuotes(
        tenantId,
        {
          dealId: query.dealId,
          accountId: query.accountId,
          ownerId: query.ownerId,
          status: query.status,
        },
        { page: query.page, limit: query.limit, sortDir: query.sortDir }
      );
    },

    async restoreQuote(ctx: EngineContext, id: string) {
      const quote = await quotes.restoreQuote(actor(ctx).tenantId, id);
      await emitCommercialEvent(ctx, {
        type: 'quote.restored',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          status: quote.status,
        },
      });
      return quote;
    },

    /**
     * Supersede a quote (archive it, mark SUPERSEDED, link the replacement).
     * Additive terminal transition used when a newer revision/version replaces
     * an existing quote.
     */
    async supersedeQuote(ctx: EngineContext, id: string, supersededById?: string | null) {
      const quote = await quotes.supersedeQuote(actor(ctx).tenantId, id, supersededById);
      await emitCommercialEvent(ctx, {
        type: 'quote.superseded',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          status: quote.status,
          supersededById: supersededById ?? null,
        },
      });
      return quote;
    },

    /**
     * View-tracking entry point (called by portal-service when a shared quote
     * link is opened). Idempotent SENT → VIEWED; emits `quote.viewed` only when
     * the status actually flips so downstream timelines aren't spammed by
     * repeated portal opens.
     */
    async markQuoteViewed(ctx: EngineContext, id: string) {
      const tenantId = actor(ctx).tenantId;
      const before = await quotes.getQuoteById(tenantId, id);
      const quote = await quotes.markQuoteViewed(tenantId, id);
      if (before.status === 'SENT' && quote.status === 'VIEWED') {
        await emitCommercialEvent(ctx, {
          type: 'quote.viewed',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            status: quote.status,
            viewedAt: quote.viewedAt?.toISOString() ?? null,
          },
        });
      }
      return quote;
    },

    async updateQuote(ctx: EngineContext, id: string, data: UpdateQuoteInput) {
      const tenantId = actor(ctx).tenantId;
      const existing = await quotes.getQuoteById(tenantId, id);
      if (data.discountAmount !== undefined) {
        const subtotal =
          data.subtotal !== undefined ? data.subtotal : Number(existing.subtotal);
        const check = await checkDiscountApproval(
          prisma,
          tenantId,
          id,
          subtotal,
          data.discountAmount,
          actor(ctx).userId,
          existing.quoteNumber ?? id
        );
        if (check.required) {
          return {
            requiresApproval: true as const,
            approval: check,
            message: quoteApprovalMessage(check),
          };
        }
      }

      const quote = await quotes.updateQuote(tenantId, id, data);
      await emitCommercialEvent(ctx, {
        type: 'quote.updated',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          status: quote.status,
          total: Number(quote.total.toFixed(2)),
          currency: quote.currency,
        },
      });
      return {
        requiresApproval: false as const,
        quote,
      };
    },

    async sendQuote(ctx: EngineContext, id: string, meta: CpqTransitionMeta = {}) {
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: id,
        action: 'SEND_TO_CUSTOMER',
        ...meta,
      }, async (transitionLedgerId) => {
        await transitionCpqEntity({
          tenantId: actor(ctx).tenantId,
          actorId: actor(ctx).userId,
          entity: 'quote',
          entityId: id,
          action: 'SEND_TO_CUSTOMER',
          idempotencyKey: meta.idempotencyKey,
          payload: { now: ctx.now },
        });
        const quote = await quotes.sendQuote(actor(ctx).tenantId, id);
        await emitCommercialEvent(ctx, {
          type: 'quote.sent',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            status: quote.status,
            total: Number(quote.total.toFixed(2)),
            currency: quote.currency,
            metadata: transitionMetadata(meta, transitionLedgerId),
          },
        });
        return quote;
      });
    },

    async expireQuote(ctx: EngineContext, id: string, meta: CpqTransitionMeta & { force?: boolean; reason?: string } = {}) {
      const idempotencyKey = meta.idempotencyKey ?? `quote-expire:${id}:${expiryBucket(ctx.now)}`;
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: id,
        action: 'EXPIRE',
        nextStatus: 'EXPIRED',
        idempotencyKey,
        correlationId: meta.correlationId ?? ctx.audit.correlationId,
        source: meta.source ?? ctx.audit.source ?? 'quote-expiry',
        sourceEventId: meta.sourceEventId,
        approvalRequestId: meta.approvalRequestId,
      }, async (transitionLedgerId) => {
        const quote = await transitionCpqEntity({
          tenantId: actor(ctx).tenantId,
          actorId: actor(ctx).userId,
          entity: 'quote',
          entityId: id,
          action: 'EXPIRE',
          idempotencyKey,
          payload: {
            now: ctx.now,
            reason: meta.reason ?? 'validity expired',
            force: meta.force,
            systemAuthority: actor(ctx).userId === 'system' ? 'quote-expiry' : undefined,
          },
        }) as Awaited<ReturnType<typeof prisma.quote.findFirst>>;
        if (!quote) throw new NotFoundError('Quote', id);
        const updated = await prisma.quote.update({
          where: { id: quote.id },
          data: {
            status: 'EXPIRED',
            // Archive-on-terminal: expired quotes leave the hot list.
            archivedAt: ctx.now,
            version: { increment: 1 },
          },
        });
        await prisma.quoteRevision.create({
          data: {
            tenantId: actor(ctx).tenantId,
            quoteId: quote.id,
            version: Number(quote.version ?? 1) + 1,
            reason: 'quote.expired',
            status: 'EXPIRED',
            snapshot: quoteRevisionSnapshot(quote as unknown as Record<string, unknown>, {
              status: 'EXPIRED',
              expiredAt: ctx.now.toISOString(),
              reason: meta.reason ?? 'validity expired',
              version: Number(quote.version ?? 1) + 1,
            }),
            createdById: actor(ctx).userId,
          },
        }).catch((err: unknown) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return undefined;
          throw err;
        });
        await emitCommercialEvent(ctx, {
          type: 'quote.expired',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            previousStatus: quote.status,
            status: 'EXPIRED',
            reason: meta.reason ?? 'validity expired',
            metadata: transitionMetadata({ ...meta, idempotencyKey }, transitionLedgerId),
          },
        });
        return updated;
      });
    },

    async expireQuotes(ctx: EngineContext, input: { tenantId?: string; limit?: number } = {}) {
      const tenantId = input.tenantId ?? actor(ctx).tenantId;
      const candidates = await prisma.quote.findMany({
        where: {
          tenantId,
          status: { in: ['APPROVED', 'SENT', 'VIEWED'] },
          OR: [
            { expiresAt: { lt: ctx.now } },
            { validUntil: { lt: ctx.now } },
          ],
        },
        take: input.limit ?? 100,
        orderBy: { expiresAt: 'asc' },
      });
      const results: Array<{ quoteId: string; transitionLedgerId?: string }> = [];
      const failures: Array<{ quoteId: string; message: string }> = [];
      const skipped: Array<{ quoteId: string; reason: string }> = [];
      for (const quote of candidates) {
        try {
          const result = await this.expireQuote(ctx, quote.id, {
            idempotencyKey: `quote-expire:${quote.id}:${expiryBucket(ctx.now)}`,
            correlationId: ctx.audit.correlationId ?? ctx.audit.requestId,
            source: 'quote-expiry-job',
            reason: 'validity expired',
          }) as Record<string, unknown>;
          results.push({ quoteId: quote.id, transitionLedgerId: result.transitionLedgerId as string | undefined });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('already') || message.includes('final status')) {
            skipped.push({ quoteId: quote.id, reason: message });
          } else {
            failures.push({ quoteId: quote.id, message });
          }
        }
      }
      return {
        expiredCount: results.length,
        skippedCount: skipped.length,
        failedCount: failures.length,
        results,
        skipped,
        failures,
      };
    },

    async reconcileStuckCpqTransitions(
      ctx: EngineContext,
      input: { tenantId?: string; olderThanMinutes: number; limit?: number }
    ) {
      const ledger = cpqTransitionLedger(prisma);
      if (!ledger?.findMany) {
        return { recoveredCount: 0, recovered: [] as Array<{ id: string }> };
      }
      const cutoff = new Date(ctx.now.getTime() - input.olderThanMinutes * 60 * 1000);
      const rows = await ledger.findMany({
        where: {
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          status: 'STARTED',
          createdAt: { lt: cutoff },
        },
        take: input.limit ?? 100,
        orderBy: { createdAt: 'asc' },
      });
      const recovered: Array<{ id: string }> = [];
      for (const row of rows) {
        await ledger.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            error: jsonSafe({
              code: 'TRANSITION_TIMEOUT',
              message: 'Transition remained STARTED beyond recovery threshold.',
              cutoff: cutoff.toISOString(),
            }),
          },
        });
        recovered.push({ id: row.id });
      }
      return { recoveredCount: recovered.length, recovered };
    },

    async acceptQuote(ctx: EngineContext, id: string, meta: CpqTransitionMeta = {}) {
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: id,
        action: 'ACCEPT',
        nextStatus: 'ACCEPTED',
        idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId,
        correlationId: meta.correlationId ?? ctx.audit.correlationId,
        source: meta.source ?? ctx.audit.source,
        sourceEventId: meta.sourceEventId,
        approvalRequestId: meta.approvalRequestId,
      }, async (transitionLedgerId) => {
        await transitionCpqEntity({
          tenantId: actor(ctx).tenantId,
          actorId: actor(ctx).userId,
          entity: 'quote',
          entityId: id,
          action: 'ACCEPT',
          idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId,
          payload: { now: ctx.now },
        });
        const quote = await quotes.acceptQuote(actor(ctx).tenantId, id);
        await emitCommercialEvent(ctx, {
          type: 'quote.accepted',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            status: quote.status,
            total: Number(quote.total.toFixed(2)),
            currency: quote.currency,
            metadata: transitionMetadata({ ...meta, idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId }, transitionLedgerId),
          },
        });
        return quote;
      });
    },

    async rejectQuote(ctx: EngineContext, id: string, reason: string, meta: CpqTransitionMeta = {}) {
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: id,
        action: 'REJECT',
        nextStatus: 'REJECTED',
        idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId,
        correlationId: meta.correlationId ?? ctx.audit.correlationId,
        source: meta.source ?? ctx.audit.source,
        sourceEventId: meta.sourceEventId,
        approvalRequestId: meta.approvalRequestId,
      }, async (transitionLedgerId) => {
        await transitionCpqEntity({
          tenantId: actor(ctx).tenantId,
          actorId: actor(ctx).userId,
          entity: 'quote',
          entityId: id,
          action: 'REJECT',
          idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId,
          payload: { now: ctx.now, rejectionReason: reason, customerRejection: true },
        });
        const quote = await quotes.rejectQuote(actor(ctx).tenantId, id, reason);
        await emitCommercialEvent(ctx, {
          type: 'quote.rejected',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            status: quote.status,
            total: Number(quote.total.toFixed(2)),
            currency: quote.currency,
            reason,
            metadata: transitionMetadata({ ...meta, idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId }, transitionLedgerId),
          },
        });
        return quote;
      });
    },

    async duplicateQuote(ctx: EngineContext, id: string) {
      const quote = await quotes.duplicateQuote(actor(ctx).tenantId, id);
      await emitCommercialEvent(ctx, {
        type: 'quote.duplicated',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          status: quote.status,
          sourceQuoteId: id,
        },
      });
      return quote;
    },

    async voidQuote(ctx: EngineContext, id: string, reason: string, meta: CpqTransitionMeta = {}) {
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: id,
        action: 'VOID',
        nextStatus: 'VOID',
        idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId,
        correlationId: meta.correlationId ?? ctx.audit.correlationId,
        source: meta.source ?? ctx.audit.source,
        sourceEventId: meta.sourceEventId,
        approvalRequestId: meta.approvalRequestId,
      }, async (transitionLedgerId) => {
        await transitionCpqEntity({
          tenantId: actor(ctx).tenantId,
          actorId: actor(ctx).userId,
          entity: 'quote',
          entityId: id,
          action: 'VOID',
          idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId,
          payload: { now: ctx.now, reason },
        });
        const quote = await quotes.voidQuote(actor(ctx).tenantId, id, reason);
        await emitCommercialEvent(ctx, {
          type: 'quote.voided',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            status: quote.status,
            reason,
            metadata: transitionMetadata({ ...meta, idempotencyKey: meta.idempotencyKey ?? ctx.audit.requestId }, transitionLedgerId),
          },
        });
        return quote;
      });
    },

    async listDealQuotes(ctx: EngineContext, dealId: string, pagination: { page: number; limit: number; sortDir: 'asc' | 'desc' }) {
      return quotes.listQuotes(actor(ctx).tenantId, { dealId }, pagination);
    },

    reasonOptions() {
      return discountRequests.reasonOptions();
    },

    async listDiscountRequests(ctx: EngineContext, query: DiscountRequestListQuery) {
      const q = query;
      return discountRequests.listDiscountRequests(
        actor(ctx).tenantId,
        { quoteId: q.quoteId, requestedById: q.requestedById, status: q.status },
        { page: q.page, limit: q.limit, sortDir: q.sortDir }
      );
    },

    async createDiscountRequest(ctx: EngineContext, data: CreateDiscountRequestInput) {
      if (!hasText(data.quoteRevisionId)) {
        throw new ValidationError('Invalid discount request', {
          fieldErrors: { quoteRevisionId: ['Discount requests must reference the quote revision being discounted.'] },
          formErrors: [],
        });
      }
      const revision = await prisma.quoteRevision.findFirst({
        where: { id: data.quoteRevisionId, tenantId: actor(ctx).tenantId, quoteId: data.quoteId },
      });
      if (!revision) throw new NotFoundError('QuoteRevision', data.quoteRevisionId);
      const created = await discountRequests.createDiscountRequest(actor(ctx).tenantId, data, actor(ctx).userId);
      await emitCommercialEvent(ctx, {
        type: 'quote.discount_request.created',
        aggregateType: 'discount_request',
        aggregateId: created.id,
        payload: {
          discountRequestId: created.id,
          quoteId: created.quoteId,
          requestedById: created.requestedById,
          status: created.status,
          reasonCode: created.reasonCode,
          requestedDiscountPercent: Number(created.requestedDiscountPercent),
          winningProbabilityIfApproved: created.winningProbabilityIfApproved,
        },
      });
      return created;
    },

    async listRfqs(ctx: EngineContext) {
      return prisma.rFQ.findMany({
        where: { tenantId: actor(ctx).tenantId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async createRfq(ctx: EngineContext, data: RfqInput) {
      const tenantId = actor(ctx).tenantId;
      if (!hasText(tenantId) || !hasText(actor(ctx).userId)) {
        throw new BusinessRuleError('RFQ creation requires tenantId and actorId');
      }
      assertRfqCreateAuthority(data);
      // BL-04: allocate the RFQ number and insert atomically so a failed insert
      // never burns a number and concurrent creates never collide.
      const rfq = await prisma.$transaction(async (tx) => {
        const rfqNumber = await generateRfqNumber(tx, tenantId);
        return tx.rFQ.create({
          data: {
            tenantId,
            rfqNumber,
            title: data.title,
            dealId: data.dealId,
            accountId: data.accountId,
            contactId: data.contactId,
            ownerId: actor(ctx).userId,
            currency: data.currency ?? 'USD',
            requiredByDate: data.requiredByDate,
            lineItems: (data.lineItems ?? []) as Prisma.InputJsonValue,
            internalNotes: data.internalNotes,
          },
        });
      });
      await emitCommercialEvent(ctx, {
        type: 'rfq.created',
        aggregateType: 'rfq',
        aggregateId: rfq.id,
        payload: {
          rfqId: rfq.id,
          rfqNumber: rfq.rfqNumber,
          accountId: rfq.accountId,
          contactId: rfq.contactId,
          dealId: rfq.dealId,
          status: rfq.status,
          currency: rfq.currency,
        },
      });
      return rfq;
    },

    async getRfq(ctx: EngineContext, id: string) {
      const row = await prisma.rFQ.findFirst({ where: { id, tenantId: actor(ctx).tenantId } });
      if (!row) throw new NotFoundError('RFQ', id);
      return row;
    },

    async submitRfqForReview(ctx: EngineContext, id: string, meta: CpqTransitionMeta = {}) {
      return transitionRfq(ctx, id, 'SUBMIT_FOR_REVIEW', 'SENT', 'rfq.submitted_for_review', meta);
    },

    async sendRfq(ctx: EngineContext, id: string, meta: CpqTransitionMeta = {}) {
      return this.submitRfqForReview(ctx, id, meta);
    },

    async startRfqReview(ctx: EngineContext, id: string, meta: CpqTransitionMeta = {}) {
      return transitionRfq(ctx, id, 'START_REVIEW', 'REVIEWING', 'rfq.review_started', meta);
    },

    async returnRfqForChanges(ctx: EngineContext, id: string, reason: string, meta: CpqTransitionMeta = {}) {
      return transitionRfq(ctx, id, 'RETURN_FOR_CHANGES', 'DRAFT', 'rfq.returned', meta, { reason });
    },

    async markRfqReadyForQuote(ctx: EngineContext, id: string, meta: CpqTransitionMeta = {}) {
      return transitionRfq(ctx, id, 'MARK_READY_FOR_QUOTE', 'RESPONDED', 'rfq.ready_for_quote', meta);
    },

    async recordRfqResponse(ctx: EngineContext, id: string, response: Record<string, unknown>, meta: CpqTransitionMeta = {}) {
      return transitionRfq(ctx, id, 'RECORD_RESPONSE', 'RESPONDED', 'rfq.responded', meta, { response });
    },

    async cancelRfq(ctx: EngineContext, id: string, reason: string, meta: CpqTransitionMeta = {}) {
      return transitionRfq(ctx, id, 'CANCEL', 'CANCELLED', 'rfq.cancelled', meta, { reason });
    },

    async convertRfq(ctx: EngineContext, id: string, meta: CpqTransitionMeta = {}) {
      const tenantId = actor(ctx).tenantId;
      return persistCpqTransition(ctx, {
        entity: 'rfq',
        entityId: id,
        action: 'CONVERT_TO_QUOTE',
        nextStatus: 'CONVERTED',
        ...meta,
      }, async (transitionLedgerId) => {
        const rfq = await transitionCpqEntity({
          tenantId,
          actorId: actor(ctx).userId,
          entity: 'rfq',
          entityId: id,
          action: 'CONVERT_TO_QUOTE',
          idempotencyKey: meta.idempotencyKey,
          payload: { now: ctx.now },
        }) as Awaited<ReturnType<typeof prisma.rFQ.findFirst>>;
        if (!rfq) throw new NotFoundError('RFQ', id);
        const dealId = rfq.dealId;
        const accountId = rfq.accountId;
        if (!dealId || !accountId) {
          throw new BusinessRuleError('RFQ must be linked to an account and deal before conversion');
        }

        const items = normalizeRfqLineItems(rfq.lineItems);

        const pricing = await pricingEngine.calculate({
          tenantId,
          dealId,
          accountId,
          currency: rfq.currency,
          items,
          appliedPromos: [],
        });
        const quote = await quotes.createQuote(
          tenantId,
          {
            rfqId: rfq.id,
            dealId,
            accountId,
            contactId: rfq.contactId ?? undefined,
            ownerId: rfq.ownerId,
            name: `Converted from ${rfq.rfqNumber}`,
            currency: rfq.currency,
            items,
            appliedPromos: [],
            customFields: { rfqId: rfq.id, approvalPolicyId: 'default-cpq-approval', source: 'rfq_conversion' },
          },
          pricing
        );

        await prisma.quote.update({
          where: { id: quote.id },
          data: { rfqId: rfq.id },
        });
        await prisma.rFQ.update({
          where: { id: rfq.id },
          data: { status: 'CONVERTED', convertedQuoteId: quote.id },
        });
        await emitCommercialEvent(ctx, {
          type: 'rfq.converted_to_quote',
          aggregateType: 'rfq',
          aggregateId: rfq.id,
          payload: {
            rfqId: rfq.id,
            rfqNumber: rfq.rfqNumber,
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            accountId: rfq.accountId,
            contactId: rfq.contactId,
            dealId: rfq.dealId,
            total: Number(quote.total.toFixed(2)),
            currency: quote.currency,
            metadata: transitionMetadata(meta, transitionLedgerId),
          },
        });
        await emitCommercialEvent(ctx, {
          type: 'quote.created_from_rfq',
          aggregateType: 'quote',
          aggregateId: quote.id,
          payload: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            rfqId: rfq.id,
            rfqNumber: rfq.rfqNumber,
            accountId: rfq.accountId,
            contactId: rfq.contactId,
            dealId: rfq.dealId,
            total: Number(quote.total.toFixed(2)),
            currency: quote.currency,
            metadata: transitionMetadata(meta, transitionLedgerId),
          },
        });

        return { rfqId: rfq.id, quoteId: quote.id };
      });
    },

    async listOrders(ctx: EngineContext, query: OrderListQuery) {
      const q = query;
      const where: Prisma.SalesOrderWhereInput = {
        tenantId: actor(ctx).tenantId,
        accountId: q.accountId,
        contactId: q.contactId,
        dealId: q.dealId,
        quoteId: q.quoteId,
        status: q.status,
      };
      const [total, rows] = await Promise.all([
        prisma.salesOrder.count({ where }),
        prisma.salesOrder.findMany({
          where,
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          orderBy: { createdAt: q.sortDir },
        }),
      ]);
      return toPaginatedResult(rows, total, q.page, q.limit);
    },

    async createOrder(ctx: EngineContext, data: CreateOrderInput) {
      const tenantId = actor(ctx).tenantId;
      if (hasText(data.quoteId)) {
        throw new BusinessRuleError('Quote-derived orders must be created through quote.CONVERT_TO_ORDER');
      }
      const sourceType = String(data.sourceType ?? data.customFields?.sourceType ?? 'MANUAL');
      if (sourceType !== 'MANUAL') {
        throw new BusinessRuleError('Manual order creation requires sourceType=MANUAL');
      }
      // BL-04: allocate the order number and insert atomically (race-free/gapless).
      const order = await prisma.$transaction(async (tx) => {
        const orderNumber = await generateOrderNumber(tx, tenantId);
        return tx.salesOrder.create({
          data: {
            tenantId,
            accountId: data.accountId,
            contactId: data.contactId ?? null,
            dealId: data.dealId ?? null,
            quoteId: data.quoteId ?? null,
            ownerId: data.ownerId,
            orderNumber,
            name: data.name,
            status: data.status,
            currency: data.currency,
            subtotal: new Prisma.Decimal(data.subtotal),
            taxAmount: new Prisma.Decimal(data.taxAmount),
            discountAmount: new Prisma.Decimal(data.discountAmount),
            total: new Prisma.Decimal(data.total),
            orderedAt: data.orderedAt ? new Date(data.orderedAt) : null,
            expectedFulfillmentAt: data.expectedFulfillmentAt ? new Date(data.expectedFulfillmentAt) : null,
            lineItems: data.lineItems as Prisma.InputJsonValue,
            customFields: { ...data.customFields, sourceType: 'MANUAL' } as Prisma.InputJsonValue,
          },
        });
      });

      await emitCommercialEvent(ctx, {
        type: 'order.created',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          accountId: order.accountId,
          contactId: order.contactId,
          dealId: order.dealId,
          quoteId: order.quoteId,
          status: order.status,
          total: Number(order.total.toFixed(2)),
          currency: order.currency,
        },
      });

      return order;
    },

    async convertQuoteToOrder(ctx: EngineContext, quoteId: string, meta: CpqTransitionMeta = {}) {
      const tenantId = actor(ctx).tenantId;
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: quoteId,
        action: 'CONVERT_TO_ORDER',
        nextStatus: 'CONVERTED',
        ...meta,
      }, async (transitionLedgerId) => {
      const quote = await transitionCpqEntity({
        tenantId,
        actorId: actor(ctx).userId,
        entity: 'quote',
        entityId: quoteId,
        action: 'CONVERT_TO_ORDER',
        idempotencyKey: meta.idempotencyKey,
        payload: { now: ctx.now },
      }) as Awaited<ReturnType<typeof prisma.quote.findFirst>>;
      if (!quote) throw new NotFoundError('Quote', quoteId);
      const pendingSignature = await prisma.quoteESignEnvelope.findFirst({
        where: { tenantId, quoteId: quote.id, status: { in: ['SENT', 'VIEWED'] } },
      });
      if (pendingSignature) {
        throw new BusinessRuleError('Quote has an open signature envelope; complete or void it before order conversion');
      }

      const order = await prisma.$transaction(async (tx) => {
        // BL-04: allocate inside the conversion transaction so a rolled-back
        // conversion never burns an order number.
        const orderNumber = await generateOrderNumber(tx, tenantId);
        const created = await tx.salesOrder.create({
          data: {
            tenantId,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            quoteId: quote.id,
            ownerId: quote.ownerId,
            orderNumber,
            name: `Order from ${quote.quoteNumber}`,
            status: 'CONFIRMED',
            currency: quote.currency,
            subtotal: quote.subtotal,
            taxAmount: quote.taxAmount,
            discountAmount: quote.discountAmount,
            total: quote.total,
            orderedAt: ctx.now,
            lineItems: quote.lineItems as Prisma.InputJsonValue,
            customFields: {
              sourceQuoteId: quote.id,
              sourceQuoteNumber: quote.quoteNumber,
              sourceQuoteVersion: quote.version,
            },
          },
        });
        await tx.quote.update({
          where: { id: quote.id },
          data: { status: 'CONVERTED', version: { increment: 1 } },
        });
        return created;
      });

      await emitCommercialEvent(ctx, {
        type: 'quote.converted_to_order',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          orderId: order.id,
          orderNumber: order.orderNumber,
          accountId: order.accountId,
          contactId: order.contactId,
          dealId: order.dealId,
          total: Number(order.total.toFixed(2)),
          currency: order.currency,
          metadata: transitionMetadata(meta, transitionLedgerId),
        },
      });

      // ─── Quote-to-cash handoff (finance = system-of-record) ─────────────
      // For orders carrying recurring products, materialize finance
      // Subscription rows and publish `subscription.created` so downstream
      // satellites (billing/Stripe) can mirror the SoR. Fully guarded: a
      // failure here must never roll back an otherwise-successful conversion.
      try {
        await createSubscriptionsForOrder(ctx, quote, order);
      } catch (err) {
        // Best-effort: log-and-continue. The order + quote conversion stand.
        producer.publish(TOPICS.CONTRACTS, {
          type: 'subscription.creation_failed',
          tenantId: actor(ctx).tenantId,
          payload: { orderId: order.id, quoteId: quote.id, error: err instanceof Error ? err.message : String(err) },
        }).catch(() => undefined);
      }

      return order;
      });
    },

    async listQuoteRevisions(ctx: EngineContext, quoteId: string) {
      return prisma.quoteRevision.findMany({
        where: { tenantId: actor(ctx).tenantId, quoteId },
        orderBy: { version: 'desc' },
      });
    },

    async listQuoteDocuments(ctx: EngineContext, quoteId: string) {
      return prisma.quoteDocument.findMany({
        where: { tenantId: actor(ctx).tenantId, quoteId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async renderQuoteDocument(ctx: EngineContext, quoteId: string, input: RenderQuoteDocumentInput) {
      const tenantId = actor(ctx).tenantId;
      const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId } });
      if (!quote) throw new NotFoundError('Quote', quoteId);
      if (quote.expiresAt && quote.expiresAt.getTime() <= ctx.now.getTime()) {
        throw new BusinessRuleError('Expired quotes cannot be rendered into customer documents');
      }

      const template = input.templateId
        ? await prisma.quoteTemplate.findFirst({
            where: { id: input.templateId, tenantId, isActive: true },
          })
        : await prisma.quoteTemplate.findFirst({
            where: { tenantId, isDefault: true, isActive: true },
            orderBy: { version: 'desc' },
          });
      const quotePayload = quote as unknown as Record<string, unknown>;
      const renderedHtml = template?.body
        ? replaceTemplateVariables(template.body, quotePayload)
        : renderDefaultQuoteHtml(quotePayload);
      const content = await buildQuoteDocumentContent(input.format, renderedHtml, quotePayload);
      const contentChecksum = checksum(content);
      const document = await prisma.quoteDocument.create({
        data: {
          tenantId,
          quoteId: quote.id,
          templateId: template?.id ?? null,
          format: input.format,
          status: 'RENDERED',
          fileName: `${quote.quoteNumber}-v${quote.version}.${input.format.toLowerCase()}`,
          contentType: quoteDocumentContentType(input.format),
          renderedHtml,
          contentBase64: content.toString('base64'),
          contentSize: content.length,
          checksum: contentChecksum,
          renderData: {
            quoteNumber: quote.quoteNumber,
            quoteVersion: quote.version,
            templateVersion: template?.version ?? null,
            renderedAs: input.format,
            checksum: contentChecksum,
            contentSize: content.length,
          } as Prisma.InputJsonValue,
          generatedById: actor(ctx).userId,
          generatedAt: ctx.now,
        },
      });

      await emitCommercialEvent(ctx, {
        type: 'quote.document.rendered',
        aggregateType: 'quote_document',
        aggregateId: document.id,
        payload: {
          documentId: document.id,
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          format: document.format,
          fileName: document.fileName,
          contentType: document.contentType,
        },
      });

      return document;
    },

    async downloadQuoteDocument(ctx: EngineContext, documentId: string) {
      const document = await prisma.quoteDocument.findFirst({ where: { id: documentId, tenantId: actor(ctx).tenantId } });
      if (!document) throw new NotFoundError('QuoteDocument', documentId);
      if (document.contentBase64) {
        const content = Buffer.from(document.contentBase64, 'base64');
        return {
          kind: 'binary' as const,
          content,
          contentType: document.contentType,
          fileName: document.fileName,
        };
      }
      if (document.format !== 'HTML') {
        return {
          kind: 'tracked' as const,
          data: {
            documentId: document.id,
            status: document.status,
            format: document.format,
            storageKey: document.storageKey,
            downloadUrl: document.storageKey ? `/api/v1/storage/${document.storageKey}` : null,
            message: 'Binary export job is tracked; storage URL is populated by the document worker.',
          },
        };
      }
      return {
        kind: 'html' as const,
        html: document.renderedHtml ?? '',
        fileName: document.fileName,
      };
    },

    async listQuoteESignEnvelopes(ctx: EngineContext, quoteId: string) {
      return prisma.quoteESignEnvelope.findMany({
        where: { tenantId: actor(ctx).tenantId, quoteId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async sendQuoteForSignature(ctx: EngineContext, quoteId: string, input: SendSignatureInput, meta: CpqTransitionMeta = {}) {
      const tenantId = actor(ctx).tenantId;
      return persistCpqTransition(ctx, {
        entity: 'quote',
        entityId: quoteId,
        action: 'REQUEST_SIGNATURE',
        nextStatus: 'SIGNATURE_REQUESTED',
        ...meta,
      }, async (transitionLedgerId) => {
      const quote = await transitionCpqEntity({
        tenantId,
        actorId: actor(ctx).userId,
        entity: 'quote',
        entityId: quoteId,
        action: 'REQUEST_SIGNATURE',
        idempotencyKey: meta.idempotencyKey,
        payload: { now: ctx.now, documentId: input.documentId },
      }) as Awaited<ReturnType<typeof prisma.quote.findFirst>>;
      if (!quote) throw new NotFoundError('Quote', quoteId);

      const envelope = await prisma.quoteESignEnvelope.create({
        data: {
          tenantId,
          quoteId: quote.id,
          documentId: input.documentId ?? null,
          provider: input.provider,
          providerEnvelopeId: `env-${quote.quoteNumber}-${ctx.now.getTime()}`,
          status: 'SENT',
          recipientName: input.recipientName,
          recipientEmail: input.recipientEmail,
          sentById: actor(ctx).userId,
          sentAt: ctx.now,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : quote.expiresAt,
          auditTrail: [
            { action: 'SENT', actor: actor(ctx).userId, at: ctx.now.toISOString(), recipientEmail: input.recipientEmail },
          ] as Prisma.InputJsonValue,
        },
      });
      await emitCommercialEvent(ctx, {
        type: 'quote.signature_requested',
        aggregateType: 'quote',
        aggregateId: quote.id,
        payload: {
          envelopeId: envelope.id,
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          recipientEmail: envelope.recipientEmail,
          status: quote.status,
          metadata: transitionMetadata(meta, transitionLedgerId),
        },
      });
      return envelope;
      });
    },

    async updateQuoteSignature(ctx: EngineContext, envelopeId: string, input: UpdateSignatureInput, meta: CpqTransitionMeta = {}) {
      const tenantId = actor(ctx).tenantId;
      const existing = await prisma.quoteESignEnvelope.findFirst({ where: { id: envelopeId, tenantId } });
      if (!existing) throw new NotFoundError('QuoteESignEnvelope', envelopeId);
      const auditTrail = Array.isArray(existing.auditTrail) ? existing.auditTrail : [];
      if (input.status === 'SIGNED') {
        return persistCpqTransition(ctx, {
          entity: 'quote',
          entityId: existing.quoteId,
          action: 'MARK_SIGNED',
          idempotencyKey: meta.idempotencyKey ?? `${envelopeId}.SIGNED`,
          correlationId: meta.correlationId,
          source: meta.source ?? ctx.audit.source,
          sourceEventId: meta.sourceEventId,
          nextStatus: 'ACCEPTED',
        }, async (transitionLedgerId) => {
          const quote = await prisma.quote.findFirst({ where: { id: existing.quoteId, tenantId } });
          if (!quote) throw new NotFoundError('Quote', existing.quoteId);
          await transitionCpqEntity({
            tenantId,
            actorId: actor(ctx).userId,
            entity: 'quote',
            entityId: existing.quoteId,
            action: 'MARK_SIGNED',
            idempotencyKey: meta.idempotencyKey ?? `${envelopeId}.SIGNED`,
            payload: { now: ctx.now, envelopeId },
          });
          const updated = await prisma.quoteESignEnvelope.update({
            where: { id: envelopeId },
            data: {
              status: input.status,
              signedAt: ctx.now,
              declinedReason: input.declinedReason ?? existing.declinedReason,
              auditTrail: [
                { action: input.status, actor: actor(ctx).userId, at: ctx.now.toISOString(), reason: input.declinedReason ?? null },
                ...auditTrail,
              ] as Prisma.InputJsonValue,
            },
          });
          await prisma.quote.update({
            where: { id: existing.quoteId },
            data: { status: 'ACCEPTED', acceptedAt: ctx.now, version: { increment: 1 } },
          });
          await emitCommercialEvent(ctx, {
            type: 'quote.signed',
            aggregateType: 'quote',
            aggregateId: existing.quoteId,
            payload: {
              envelopeId: updated.id,
              quoteId: existing.quoteId,
              quoteNumber: quote.quoteNumber,
              accountId: quote.accountId,
              contactId: quote.contactId,
              dealId: quote.dealId,
              status: 'ACCEPTED',
              declinedReason: updated.declinedReason,
              metadata: transitionMetadata({ ...meta, idempotencyKey: meta.idempotencyKey ?? `${envelopeId}.SIGNED` }, transitionLedgerId),
            },
          });
          return updated;
        });
      }
      const updated = await prisma.quoteESignEnvelope.update({
        where: { id: envelopeId },
        data: {
          status: input.status,
          viewedAt: input.status === 'VIEWED' ? ctx.now : existing.viewedAt,
          signedAt: existing.signedAt,
          declinedAt: input.status === 'DECLINED' ? ctx.now : existing.declinedAt,
          declinedReason: input.declinedReason ?? existing.declinedReason,
          auditTrail: [
            { action: input.status, actor: actor(ctx).userId, at: ctx.now.toISOString(), reason: input.declinedReason ?? null },
            ...auditTrail,
          ] as Prisma.InputJsonValue,
        },
      });
      await emitCommercialEvent(ctx, {
        type: `quote.esign.${input.status.toLowerCase()}`,
        aggregateType: 'quote_esign',
        aggregateId: updated.id,
        payload: {
          envelopeId: updated.id,
          quoteId: existing.quoteId,
          status: updated.status,
          declinedReason: updated.declinedReason,
        },
      });
      return updated;
    },

    async listQuoteTemplates(ctx: EngineContext) {
      return prisma.quoteTemplate.findMany({
        where: { tenantId: actor(ctx).tenantId },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }, { version: 'desc' }],
      });
    },

    async createQuoteTemplate(ctx: EngineContext, data: QuoteTemplateInput): Promise<QuoteTemplate> {
      const tenantId = actor(ctx).tenantId;
      assertTemplateContent(data);
      if (data.isDefault) {
        await prisma.quoteTemplate.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return prisma.quoteTemplate.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description,
          storageKey: data.storageKey ?? templateStorageKey(tenantId, data.name),
          version: data.version ?? 1,
          status: data.status ?? (data.isActive === false ? 'ARCHIVED' : 'ACTIVE'),
          contentType: data.contentType ?? 'text/html',
          body: data.body ?? null,
          variables: data.variables ?? [],
          isDefault: data.isDefault ?? false,
          isActive: data.isActive ?? true,
          language: data.language ?? 'en',
        },
      });
    },

    async updateQuoteTemplate(ctx: EngineContext, id: string, data: Partial<QuoteTemplateInput>): Promise<QuoteTemplate> {
      const tenantId = actor(ctx).tenantId;
      const existing = await prisma.quoteTemplate.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundError('QuoteTemplate', id);
      if (data.contentType !== undefined || data.body !== undefined || data.contentBase64 !== undefined) {
        assertTemplateContent({
          name: data.name ?? existing.name,
          contentType: data.contentType ?? (existing.contentType as QuoteTemplateInput['contentType']),
          body: data.body ?? existing.body ?? undefined,
          contentBase64: data.contentBase64,
        });
      }
      if (data.isDefault) {
        await prisma.quoteTemplate.updateMany({
          where: { tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return prisma.quoteTemplate.update({
        where: { id },
        data: {
          description: data.description,
          storageKey: data.storageKey,
          status: data.status,
          contentType: data.contentType,
          body: data.body,
          variables: data.variables,
          isDefault: data.isDefault,
          isActive: data.isActive,
        },
      });
    },
  };
}

export type CommercialRecordsUseCase = ReturnType<typeof createCommercialRecordsUseCase>;
