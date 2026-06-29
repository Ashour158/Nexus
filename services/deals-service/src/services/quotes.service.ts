import type { PaginatedResult } from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import type { QuoteListQuery } from '@nexus/validation';
import type { Quote } from '../../../../node_modules/.prisma/deals-client/index.js';
import type { DealsPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';

type QuoteListFilters = Omit<QuoteListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

function quoteMutationMoved(): never {
  const err = new Error('Quote mutations have moved to finance-service authority.');
  (err as Error & { extensions?: Record<string, unknown> }).extensions = {
    code: 'CPQ_MUTATION_DISABLED',
    status: 410,
    migration: 'Consume finance-service quote events through a read-model projector instead of mutating deals-service quote state directly.',
  };
  throw err;
}

export function createQuotesService(prisma: DealsPrisma) {
  return {
    async listQuotes(tenantId: string, filters: QuoteListFilters, pagination: ListPagination): Promise<PaginatedResult<Quote>> {
      const where: any = { tenantId };
      if (filters.dealId) where.dealId = filters.dealId;
      if (filters.accountId) where.accountId = filters.accountId;
      if (filters.ownerId) where.ownerId = filters.ownerId;
      if (filters.status) where.status = filters.status;
      const [total, rows] = await Promise.all([
        prisma.quote.count({ where }),
        prisma.quote.findMany({
    where, skip: (pagination.page - 1) * pagination.limit, take: pagination.limit, orderBy: { createdAt: 'desc' } }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getQuoteById(tenantId: string, id: string): Promise<Quote> {
      const row = await prisma.quote.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Quote', id);
      return row;
    },

    async syncQuoteFromEvent(tenantId: string, eventPayload: Record<string, unknown>): Promise<Quote> {
      void tenantId;
      void eventPayload;
      quoteMutationMoved();
    },
  };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
