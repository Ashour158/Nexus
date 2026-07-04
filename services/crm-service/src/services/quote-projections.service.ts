import { toPaginatedResult } from '@nexus/shared-types';
import type { CrmPrisma } from '../prisma.js';

type ProjectionPrisma = Pick<CrmPrisma, 'quoteProjection'>;

type Pagination = {
  page: number;
  limit: number;
};

/**
 * Read-side of the quote-projection read-model (migrated from deals-service).
 * Serves the per-deal / per-account / per-contact quotes list backing the
 * deal-detail Quotes tab. Reads directly from the local CrmPrisma projection
 * table — no HTTP hop to deals-service.
 */
export function createQuoteProjectionsService(prisma: CrmPrisma) {
  const db = prisma as ProjectionPrisma;

  async function list(where: Record<string, unknown>, pagination: Pagination) {
    const { page, limit } = pagination;
    const [total, rows] = await Promise.all([
      db.quoteProjection.count({ where } as never),
      db.quoteProjection.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { projectedAt: 'desc' },
      } as never),
    ]);
    return toPaginatedResult(rows as unknown[], total, page, limit);
  }

  return {
    listByDeal(tenantId: string, dealId: string, pagination: Pagination) {
      return list({ tenantId, dealId }, pagination);
    },
    listByAccount(tenantId: string, accountId: string, pagination: Pagination) {
      return list({ tenantId, accountId }, pagination);
    },
    listByContact(tenantId: string, contactId: string, pagination: Pagination) {
      return list({ tenantId, contactId }, pagination);
    },
  };
}
