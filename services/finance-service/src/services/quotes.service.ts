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
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type {
  Quote,
  QuoteStatus,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type QuoteListFilters = Omit<
  QuoteListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

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
  if (f.ownerId) where.ownerId = f.ownerId;
  if (f.status) where.status = f.status;
  return where;
}

function toPrismaDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function assertInStatus(quote: Quote, allowed: QuoteStatus[], action: string) {
  if (!allowed.includes(quote.status)) {
    throw new BusinessRuleError(
      `Cannot ${action} a quote in status ${quote.status}`
    );
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
  producer: NexusProducer
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
      data: CreateQuoteInput,
      pricingResult: CpqPricingResult
    ): Promise<Quote> {
      if (pricingResult.items.length === 0) {
        throw new BusinessRuleError('Quote must include at least one line item');
      }
      const quoteNumber = await generateQuoteNumber(prisma, tenantId);

      try {
        const created = await prisma.quote.create({
          data: {
              tenantId,
              dealId: data.dealId,
              accountId: data.accountId,
              ownerId: data.ownerId,
              quoteNumber,
              name: data.name,
              status: 'DRAFT',
              currency: data.currency,
              subtotal: toPrismaDecimal(pricingResult.subtotal),
              discountAmount: toPrismaDecimal(pricingResult.discountTotal),
              taxAmount: toPrismaDecimal(pricingResult.taxTotal),
              total: toPrismaDecimal(pricingResult.total),
              validUntil: data.validUntil ? new Date(data.validUntil) : null,
              expiresAt: data.validUntil ? new Date(data.validUntil) : null,
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

        await producer
          .publish(TOPICS.QUOTES, {
            type: 'quote.created',
            tenantId,
            payload: {
              quoteId: created.id,
              dealId: created.dealId,
              accountId: created.accountId,
              total: Number(created.total.toFixed(2)),
              currency: created.currency,
            },
          })
          .catch(() => undefined);

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
        updateData.validUntil = dt;
        updateData.expiresAt = dt;
      }
      if (data.terms !== undefined) updateData.terms = data.terms;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.customFields !== undefined)
        updateData.customFields = data.customFields as Prisma.InputJsonValue;

      return prisma.quote.update({ where: { id }, data: updateData });
    },

    async sendQuote(tenantId: string, id: string): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      assertInStatus(existing, ['DRAFT'], 'send');

      const now = new Date();
      const updated = await prisma.quote.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: now,
          version: { increment: 1 },
        },
      });

      await producer
        .publish(TOPICS.QUOTES, {
          type: 'quote.sent',
          tenantId,
          payload: {
            quoteId: updated.id,
            dealId: updated.dealId,
            accountId: updated.accountId,
            total: Number(updated.total.toFixed(2)),
            recipientEmail: undefined,
          },
        })
        .catch(() => undefined);

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

      await producer
        .publish(TOPICS.QUOTES, {
          type: 'quote.accepted',
          tenantId,
          payload: {
            quoteId: updated.id,
            dealId: updated.dealId,
            total: Number(updated.total.toFixed(2)),
            currency: updated.currency,
          },
        })
        .catch(() => undefined);

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

      await producer
        .publish(TOPICS.QUOTES, {
          type: 'quote.rejected',
          tenantId,
          payload: {
            quoteId: updated.id,
            dealId: updated.dealId,
            total: Number(updated.total.toFixed(2)),
            reason,
          },
        })
        .catch(() => undefined);

      return updated;
    },

    /**
     * Batch-expires SENT quotes whose `expiresAt` has passed. Returns the
     * number of rows updated. Intended to be driven by a scheduler; callers
     * scope to a single tenant.
     */
    async expireQuotes(tenantId: string): Promise<number> {
      const now = new Date();
      const result = await prisma.quote.updateMany({
        where: {
          tenantId,
          status: 'SENT',
          expiresAt: { lt: now },
        },
        data: { status: 'EXPIRED' },
      });
      return result.count;
    },

    async duplicateQuote(tenantId: string, id: string): Promise<Quote> {
      const existing = await loadOrThrow(tenantId, id);
      const newNumber = await generateQuoteNumber(prisma, tenantId);
      return prisma.quote.create({
        data: {
          tenantId,
          dealId: existing.dealId,
          accountId: existing.accountId,
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

      await producer
        .publish(TOPICS.QUOTES, {
          type: 'quote.voided',
          tenantId,
          payload: {
            quoteId: updated.id,
            dealId: updated.dealId,
            reason,
          },
        })
        .catch(() => undefined);

      return updated;
    },
  };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
