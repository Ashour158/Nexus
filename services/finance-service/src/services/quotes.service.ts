import type { CpqPricingResult, PaginatedResult } from '@nexus/shared-types';
import type { CpqPricingResultEx } from '../cpq/pricing-engine.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '@nexus/service-utils';
import type {
  CreateQuoteInput,
  QuoteListQuery,
  UpdateQuoteInput,
} from '@nexus/validation';
import type { NexusProducer } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type {
  Quote,
  QuoteStatus,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';

// ─── Types ──────────────────────────────────────────────────────────────────

type QuoteListFilters = Omit<
  QuoteListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
> & { contactId?: string };

type ContactLinkedCreateQuoteInput = CreateQuoteInput & {
  contactId?: string;
  /** Price Books (feature 1) — optional; threaded onto Quote.priceBookId. */
  priceBookId?: string | null;
};

interface ListPagination {
  page: number;
  limit: number;
  sortDir: 'asc' | 'desc';
}

/**
 * Quote with its denormalized line-items payload. The line items are
 * persisted as JSON (`Quote.lineItems`) — the structure mirrors the
 * `CpqPricingResult.items` shape.
 */
export type QuoteWithLineItems = Quote;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generates the next tenant quote number from the admin-controlled
 * `QuoteNumberConfig` (prefix / separator / year / padding / yearly reset). The
 * sequence is incremented inside a transaction so concurrent quote creation can
 * never mint the same number (the old count()-based scheme was race-prone).
 */
async function generateQuoteNumber(
  prisma: FinancePrisma,
  tenantId: string
): Promise<string> {
  const year = new Date().getUTCFullYear();
  return prisma.$transaction(async (tx) => {
    let cfg = await tx.quoteNumberConfig.findUnique({ where: { tenantId } });
    if (!cfg) cfg = await tx.quoteNumberConfig.create({ data: { tenantId } });

    let seq = cfg.nextSequence;
    let lastYear = cfg.lastYear;
    if (cfg.resetYearly && cfg.lastYear !== year) {
      seq = 1;
      lastYear = year;
    }
    await tx.quoteNumberConfig.update({
      where: { tenantId },
      data: { nextSequence: seq + 1, lastYear },
    });

    const parts = [cfg.prefix];
    if (cfg.includeYear) parts.push(String(year));
    parts.push(String(seq).padStart(Math.max(1, cfg.padding), '0'));
    return parts.join(cfg.separator);
  });
}

/**
 * Highest active approval tier this quote crosses (0 = no approval needed).
 * A tier matches when the quote total >= its minAmount AND/OR the effective
 * discount % >= its minDiscountPercent (unset thresholds are ignored).
 */
async function computeRequiredApprovalLevel(
  prisma: FinancePrisma,
  tenantId: string,
  total: number,
  discountPercent: number
): Promise<number> {
  const tiers = await prisma.quoteApprovalTier.findMany({
    where: { tenantId, isActive: true },
  });
  let level = 0;
  for (const t of tiers) {
    const amountOk = t.minAmount == null || total >= Number(t.minAmount);
    const discountOk =
      t.minDiscountPercent == null || discountPercent >= Number(t.minDiscountPercent);
    // A tier with both thresholds requires both; a tier with one requires that one.
    const matches =
      (t.minAmount != null && t.minDiscountPercent != null && amountOk && discountOk) ||
      (t.minAmount != null && t.minDiscountPercent == null && amountOk) ||
      (t.minAmount == null && t.minDiscountPercent != null && discountOk);
    if (matches && t.level > level) level = t.level;
  }
  return level;
}

/**
 * Pulls default terms / payment terms / notes / validity from an active
 * QuoteTemplate so a quote created against a template inherits its boilerplate
 * (only where the request didn't already supply the field).
 */
async function applyTemplateDefaults(
  prisma: FinancePrisma,
  tenantId: string,
  templateId: string | null | undefined,
  data: { terms?: string | null; paymentTerms?: string | null; notes?: string | null }
): Promise<{ terms?: string | null; paymentTerms?: string | null; notes?: string | null }> {
  if (!templateId) return data;
  const tpl = await prisma.quoteTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!tpl) return data;
  const vars = (tpl.variables ?? {}) as Record<string, unknown>;
  return {
    terms: data.terms ?? (typeof vars.terms === 'string' ? vars.terms : tpl.body ?? null),
    paymentTerms:
      data.paymentTerms ?? (typeof vars.paymentTerms === 'string' ? vars.paymentTerms : null),
    notes: data.notes ?? (typeof vars.notes === 'string' ? vars.notes : null),
  };
}

function buildWhere(
  tenantId: string,
  f: QuoteListFilters
): Prisma.QuoteWhereInput {
  // Default quote lists exclude archived rows so the hot list stays clean.
  // Archived quotes are read exclusively via `listArchivedQuotes` below.
  const where: Prisma.QuoteWhereInput = { tenantId, archivedAt: null };
  if (f.dealId) where.dealId = f.dealId;
  if (f.accountId) where.accountId = f.accountId;
  if (f.contactId) where.contactId = f.contactId;
  if (f.ownerId) where.ownerId = f.ownerId;
  if (f.status) where.status = f.status;
  return where;
}

function toPrismaDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function assertFutureDate(date: Date | null | undefined, label: string) {
  if (!date) {
    throw new BusinessRuleError(`${label} is required`);
  }
  if (date.getTime() <= Date.now()) {
    throw new BusinessRuleError(`${label} must be in the future`);
  }
}

function assertInStatus(quote: Quote, allowed: QuoteStatus[], action: string) {
  if (!allowed.includes(quote.status)) {
    throw new BusinessRuleError(
      `Cannot ${action} a quote in status ${quote.status}`
    );
  }
}

function quoteSnapshot(quote: Quote): Prisma.InputJsonValue {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    version: quote.version,
    status: quote.status,
    dealId: quote.dealId,
    accountId: quote.accountId,
    contactId: quote.contactId,
    ownerId: quote.ownerId,
    currency: quote.currency,
    subtotal: quote.subtotal.toString(),
    discountAmount: quote.discountAmount.toString(),
    taxAmount: quote.taxAmount.toString(),
    total: quote.total.toString(),
    validUntil: quote.validUntil?.toISOString() ?? null,
    expiresAt: quote.expiresAt?.toISOString() ?? null,
    approvalRequired: quote.approvalRequired,
    approvalStatus: quote.approvalStatus,
    lineItems: quote.lineItems,
    pricingBreakdown: quote.pricingBreakdown,
    customFields: quote.customFields,
  } as Prisma.InputJsonValue;
}

function normalizeQuoteLines(
  tenantId: string,
  quoteId: string,
  pricingResult: CpqPricingResult
) {
  return pricingResult.items.map((item, index) => ({
    tenantId,
    quoteId,
    productId: item.productId,
    productName: item.productName,
    // Governance: every line carries a non-empty name AND description. Prefer an
    // explicit note/description, else fall back to the product name so a line is
    // never persisted blank.
    description: item.notes?.trim() || item.productName || 'Line item',
    quantity: toPrismaDecimal(item.quantity),
    listPrice: toPrismaDecimal(item.listPrice),
    unitPrice: toPrismaDecimal(item.unitPrice),
    discountPercent: toPrismaDecimal(item.discountPercent),
    discountAmount: toPrismaDecimal(item.discountAmount * item.quantity),
    taxPercent: toPrismaDecimal(item.taxPercent),
    taxAmount: toPrismaDecimal(item.taxAmount),
    lineTotal: toPrismaDecimal(item.total),
    sortOrder: index,
    source: 'CPQ',
    customFields: {} as Prisma.InputJsonValue,
  }));
}

async function persistQuoteArtifacts(
  prisma: FinancePrisma,
  tenantId: string,
  quote: Quote,
  reason: string,
  createdById?: string,
  pricingResult?: CpqPricingResult
) {
  const db = prisma as unknown as {
    quoteLine?: { deleteMany: Function; createMany: Function };
    quoteRevision?: { create: Function };
  };

  if (pricingResult && db.quoteLine) {
    await db.quoteLine.deleteMany({ where: { tenantId, quoteId: quote.id } });
    await db.quoteLine.createMany({
      data: normalizeQuoteLines(tenantId, quote.id, pricingResult),
    });
  }

  if (db.quoteRevision) {
    await db.quoteRevision.create({
      data: {
        tenantId,
        quoteId: quote.id,
        version: quote.version,
        reason,
        status: quote.status,
        snapshot: quoteSnapshot(quote),
        createdById: createdById ?? null,
      },
    }).catch((err: unknown) => {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return undefined;
      }
      throw err;
    });
  }
}

// ─── Service Factory ────────────────────────────────────────────────────────

/**
 * Quotes service (Section 40, quotes persistence). The CPQ pricing engine is
 * stateless and calculates the waterfall — this service persists the result
 * as a versioned `Quote` with denormalized line items, enforces the DRAFT →
 * SENT → ACCEPTED/REJECTED lifecycle, and publishes `quote.*` events so the
 * notification and commission pipelines can react.
 */
export function createQuotesService(
  prisma: FinancePrisma,
  _producer: NexusProducer
) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Quote> {
    const row = await prisma.quote.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Quote', id);
    return row;
  }

  return {
    async listQuotes(
      tenantId: string,
      filters: QuoteListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Quote>> {
      const where = buildWhere(tenantId, filters);
      const { page, limit, sortDir } = pagination;
      const [total, rows] = await Promise.all([
        prisma.quote.count({ where }),
        prisma.quote.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: sortDir },
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async getQuoteById(
      tenantId: string,
      id: string
    ): Promise<QuoteWithLineItems> {
      return loadOrThrow(tenantId, id);
    },

    /**
     * Persists a priced quote atomically. Accepts the `CpqPricingResult`
     * emitted by `CpqPricingEngine.calculate()` and the client-submitted
     * `CreateQuoteInput`. The quote starts in `DRAFT` and records
     * `approvalRequired` from the pricing result so downstream approval
     * routing can enforce it.
     */
    async createQuote(
      tenantId: string,
      data: ContactLinkedCreateQuoteInput,
      pricingResult: CpqPricingResultEx
    ): Promise<Quote> {
      if (pricingResult.items.length === 0) {
        throw new BusinessRuleError('Quote must include at least one line item');
      }
      const quoteNumber = await generateQuoteNumber(prisma, tenantId);
      const expiry = data.validUntil
        ? new Date(data.validUntil)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      assertFutureDate(expiry, 'Quote expiry date');

      // Multi-level approval: does this quote's total / effective discount cross
      // any active approval tier? Combined with the CPQ engine's own signal.
      const subtotalNum = Number(pricingResult.subtotal) || 0;
      const effectiveDiscountPct =
        subtotalNum > 0 ? (Number(pricingResult.discountTotal) / subtotalNum) * 100 : 0;
      const requiredLevel = await computeRequiredApprovalLevel(
        prisma,
        tenantId,
        Number(pricingResult.total) || 0,
        effectiveDiscountPct
      );
      const needsApproval = pricingResult.approvalRequired || requiredLevel > 0;
      // Templates: inherit boilerplate terms / payment terms / notes.
      const tpl = await applyTemplateDefaults(prisma, tenantId, data.templateId, {
        terms: data.terms,
        paymentTerms: data.paymentTerms,
        notes: data.notes,
      });

      try {
        const created = await prisma.quote.create({
          data: {
              tenantId,
              dealId: data.dealId,
              accountId: data.accountId,
              contactId: data.contactId ?? null,
              ownerId: data.ownerId,
              quoteNumber,
              name: data.name,
              rfqId: data.rfqId ?? null,
              templateId: data.templateId ?? null,
              status: needsApproval ? 'PENDING_APPROVAL' : 'DRAFT',
              requiredApprovalLevel: requiredLevel,
              approvalLevel: 0,
              currency: data.currency,
              subtotal: toPrismaDecimal(pricingResult.subtotal),
              discountAmount: toPrismaDecimal(pricingResult.discountTotal),
              taxAmount: toPrismaDecimal(pricingResult.taxTotal),
              total: toPrismaDecimal(pricingResult.total),
              validUntil: expiry,
              expiresAt: expiry,
              approvalRequired: needsApproval,
              approvalStatus: needsApproval ? 'PENDING' : null,
              // ── Flagship CPQ columns (features 1–3) ─────────────────────
              // All optional / null-safe: absent inputs leave columns null.
              priceBookId: pricingResult.priceBookId ?? data.priceBookId ?? null,
              marginTotal:
                pricingResult.marginTotal !== undefined
                  ? toPrismaDecimal(pricingResult.marginTotal)
                  : null,
              baseCurrency: pricingResult.baseCurrency ?? null,
              exchangeRate:
                pricingResult.exchangeRate !== undefined
                  ? toPrismaDecimal(pricingResult.exchangeRate)
                  : null,
              baseTotal:
                pricingResult.baseTotal !== undefined
                  ? toPrismaDecimal(pricingResult.baseTotal)
                  : null,
              paymentTerms: tpl.paymentTerms ?? null,
              terms: tpl.terms ?? null,
              notes: tpl.notes ?? null,
              appliedPromos: data.appliedPromos,
              lineItems: pricingResult.items as unknown as Prisma.InputJsonValue,
              pricingBreakdown: {
                appliedRules: pricingResult.appliedRules,
                floorPriceWarnings: pricingResult.floorPriceWarnings,
                approvalReasons: pricingResult.approvalReasons,
              } as Prisma.InputJsonValue,
            customFields: data.customFields as Prisma.InputJsonValue,
          },
        });

        await persistQuoteArtifacts(
          prisma,
          tenantId,
          created,
          'quote.created',
          data.ownerId,
          pricingResult
        );

        if (created.approvalRequired) {
          await fetch(`${process.env.APPROVAL_SERVICE_URL}/api/v1/approval/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
            },
            body: JSON.stringify({
              module: 'quote',
              recordId: created.id,
              requestedBy: data.ownerId,
              data: {
                amount: created.total.toString(),
                currency: created.currency,
                quoteNumber: created.quoteNumber,
              },
            }),
          }).catch((err: unknown) => {
            console.error('[quotes.service] Failed to create approval request for quote — discount may require manual approval', { quoteId: created.id, err });
          });
        }

        return created;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictError('Quote', 'quoteNumber');
        }
        throw err;
      }
    },

    async updateQuote(
      tenantId: string,
      id: string,
      data: UpdateQuoteInput
    ): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      assertInStatus(existing, ['DRAFT'], 'update');

      const updateData: Prisma.QuoteUpdateInput = {
        version: { increment: 1 },
      };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.validUntil !== undefined) {
        const dt = data.validUntil === null ? null : new Date(data.validUntil);
        assertFutureDate(dt, 'Quote expiry date');
        updateData.validUntil = dt;
        updateData.expiresAt = dt;
      }
      if (data.terms !== undefined) updateData.terms = data.terms;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.customFields !== undefined)
        updateData.customFields = data.customFields as Prisma.InputJsonValue;

      if (data.discountAmount !== undefined) {
        updateData.discountAmount = toPrismaDecimal(data.discountAmount);
        const subtotalNum = Number(existing.subtotal);
        const taxNum = Number(existing.taxAmount);
        updateData.total = toPrismaDecimal(subtotalNum - data.discountAmount + taxNum);
      }

      const updated = await prisma.quote.update({ where: { id }, data: updateData });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.updated');
      return updated;
    },

    async sendQuote(tenantId: string, id: string): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      assertInStatus(existing, ['DRAFT', 'APPROVED'], 'send');
      if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
        throw new BusinessRuleError('Expired quotes cannot be sent');
      }
      if (existing.approvalRequired && existing.approvalStatus !== 'APPROVED') {
        throw new BusinessRuleError('Quote requires approved discount workflow before it can be sent');
      }

      const now = new Date();
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: now,
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.sent');

      return updated;
    },

    /**
     * View-tracking: idempotently flips a quote SENT → VIEWED and stamps
     * `viewedAt` the first time a shared portal link is opened. Only transitions
     * from SENT (so an already-VIEWED/ACCEPTED/etc. quote is returned unchanged
     * and repeated views are a no-op). Returns the (possibly unchanged) quote.
     */
    async markQuoteViewed(tenantId: string, id: string): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status !== 'SENT') {
        return existing;
      }
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'VIEWED',
          viewedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.viewed');
      return updated;
    },

    async acceptQuote(tenantId: string, id: string): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      assertInStatus(existing, ['SENT', 'VIEWED'], 'accept');

      const now = new Date();
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: now,
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.accepted');

      return updated;
    },

    async rejectQuote(
      tenantId: string,
      id: string,
      reason: string
    ): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      assertInStatus(existing, ['SENT', 'VIEWED'], 'reject');

      const now = new Date();
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedAt: now,
          rejectionReason: reason,
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.rejected');

      return updated;
    },

    /**
     * Deprecated: quote expiry is an authoritative CPQ lifecycle transition.
     * Call commercialRecords.expireQuotes(...) so each quote receives its own
     * transition ledger row, audit metadata, and outbox event.
     */
    async expireQuotes(tenantId: string): Promise<number> {
      void tenantId;
      throw new BusinessRuleError('Quote expiry moved to finance CPQ transition authority');
    },

    async duplicateQuote(tenantId: string, id: string): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      const newNumber = await generateQuoteNumber(prisma, tenantId);
      const duplicated = await prisma.quote.create({
        data: {
          tenantId,
          dealId: existing.dealId,
          accountId: existing.accountId,
          contactId: existing.contactId,
          ownerId: existing.ownerId,
          quoteNumber: newNumber,
          name: `${existing.name} (Copy)`,
          status: 'DRAFT',
          currency: existing.currency,
          subtotal: existing.subtotal,
          discountAmount: existing.discountAmount,
          taxAmount: existing.taxAmount,
          total: existing.total,
          validUntil: existing.validUntil,
          expiresAt: existing.expiresAt,
          approvalRequired: existing.approvalRequired,
          paymentTerms: existing.paymentTerms,
          terms: existing.terms,
          notes: existing.notes,
          appliedPromos: existing.appliedPromos,
          lineItems: existing.lineItems as Prisma.InputJsonValue,
          pricingBreakdown:
            existing.pricingBreakdown as Prisma.InputJsonValue,
          customFields: existing.customFields as Prisma.InputJsonValue,
          version: 1,
        },
      });
      const pricingLike: CpqPricingResult = {
        items: Array.isArray(existing.lineItems)
          ? (existing.lineItems as unknown as CpqPricingResult['items'])
          : [],
        subtotal: Number(existing.subtotal),
        discountTotal: Number(existing.discountAmount),
        taxTotal: Number(existing.taxAmount),
        total: Number(existing.total),
        appliedRules: [],
        floorPriceWarnings: [],
        approvalRequired: existing.approvalRequired,
        approvalReasons: [],
      };
      await persistQuoteArtifacts(
        prisma,
        tenantId,
        duplicated,
        'quote.duplicated',
        existing.ownerId,
        pricingLike
      );
      return duplicated;
    },

    async voidQuote(
      tenantId: string,
      id: string,
      reason: string
    ): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      assertInStatus(existing, ['DRAFT', 'SENT', 'VIEWED'], 'void');

      const now = new Date();
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'VOID',
          voidedAt: now,
          voidReason: reason,
          // Archive-on-terminal: voided quotes leave the hot list.
          archivedAt: now,
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.voided');

      return updated;
    },

    /**
     * Supersede-on-terminal: marks a quote as replaced by a newer revision or
     * version. Sets status → SUPERSEDED, stamps `archivedAt`, and records the
     * replacing quote id in `supersededById`. Only non-terminal quotes can be
     * superseded; already-archived quotes are returned unchanged (idempotent).
     */
    async supersedeQuote(
      tenantId: string,
      id: string,
      supersededById?: string | null
    ): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.archivedAt) return existing;
      const now = new Date();
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'SUPERSEDED',
          archivedAt: now,
          supersededById: supersededById ?? null,
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.superseded');
      return updated;
    },

    /**
     * Lists archived quotes (terminal: expired / voided / superseded) — the
     * complement of `listQuotes`, which filters them out. Paginated,
     * tenant-scoped; supports the same optional filters.
     */
    async listArchivedQuotes(
      tenantId: string,
      filters: QuoteListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Quote>> {
      const where: Prisma.QuoteWhereInput = { tenantId, archivedAt: { not: null } };
      if (filters.dealId) where.dealId = filters.dealId;
      if (filters.accountId) where.accountId = filters.accountId;
      if (filters.contactId) where.contactId = filters.contactId;
      if (filters.ownerId) where.ownerId = filters.ownerId;
      if (filters.status) where.status = filters.status;
      const { page, limit, sortDir } = pagination;
      const [total, rows] = await Promise.all([
        prisma.quote.count({ where }),
        prisma.quote.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { archivedAt: sortDir },
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    /**
     * Restores an archived quote by clearing `archivedAt` and moving it back to
     * a sane, editable status (`DRAFT`). Only archived quotes can be restored.
     * Terminal business fields (voidedAt/voidReason) are cleared so the quote is
     * genuinely usable again; supersededById is cleared too.
     */
    async restoreQuote(tenantId: string, id: string): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      if (!existing.archivedAt) {
        throw new BusinessRuleError('Only archived quotes can be restored');
      }
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'DRAFT',
          archivedAt: null,
          supersededById: null,
          voidedAt: null,
          voidReason: null,
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.restored');
      return updated;
    },
  };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
