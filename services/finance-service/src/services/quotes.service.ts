import type { CpqPricingResult, PaginatedResult } from '@nexus/shared-types';
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

type ContactLinkedCreateQuoteInput = CreateQuoteInput & { contactId?: string };

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
 * Generates a tenant-scoped quote number of the form `QUO-{YEAR}-{SEQ}` where
 * SEQ is the count of quotes already issued this calendar year (padded).
 */
async function generateQuoteNumber(
  prisma: FinancePrisma,
  tenantId: string
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const count = await prisma.quote.count({
    where: { tenantId, createdAt: { gte: yearStart, lt: yearEnd } },
  });
  const seq = String(count + 1).padStart(5, '0');
  return `QUO-${year}-${seq}`;
}

function buildWhere(
  tenantId: string,
  f: QuoteListFilters
): Prisma.QuoteWhereInput {
  const where: Prisma.QuoteWhereInput = { tenantId };
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
    description: item.notes ?? null,
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
      pricingResult: CpqPricingResult
    ): Promise<Quote> {
      if (pricingResult.items.length === 0) {
        throw new BusinessRuleError('Quote must include at least one line item');
      }
      const quoteNumber = await generateQuoteNumber(prisma, tenantId);
      const expiry = data.validUntil
        ? new Date(data.validUntil)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      assertFutureDate(expiry, 'Quote expiry date');

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
              status: pricingResult.approvalRequired ? 'PENDING_APPROVAL' : 'DRAFT',
              currency: data.currency,
              subtotal: toPrismaDecimal(pricingResult.subtotal),
              discountAmount: toPrismaDecimal(pricingResult.discountTotal),
              taxAmount: toPrismaDecimal(pricingResult.taxTotal),
              total: toPrismaDecimal(pricingResult.total),
              validUntil: expiry,
              expiresAt: expiry,
              approvalRequired: pricingResult.approvalRequired,
              approvalStatus: pricingResult.approvalRequired
                ? 'PENDING'
                : null,
              paymentTerms: data.paymentTerms ?? null,
              terms: data.terms ?? null,
              notes: data.notes ?? null,
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

      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'VOID',
          voidedAt: new Date(),
          voidReason: reason,
          version: { increment: 1 },
        },
      });
      await persistQuoteArtifacts(prisma, tenantId, updated, 'quote.voided');

      return updated;
    },
  };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
