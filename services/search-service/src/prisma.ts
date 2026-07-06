import { PrismaClient } from '../../../node_modules/.prisma/search-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';

/**
 * Lightweight Prisma client for search-service, backing saved searches
 * (SRCH-08) and recent-search history (SRCH-09). These are per-user UX records,
 * not domain aggregates, so — unlike most services — there is no outbox /
 * tenant-ALS / field-encryption layer here. Every query is explicitly scoped by
 * tenantId + userId at the call site.
 *
 * Requires SEARCH_DATABASE_URL to point at a Postgres database (a new
 * `nexus_search` DB may need creating + `prisma migrate` run against it).
 */
export function createSearchPrisma() {
  return createPrismaClientWithReplicas(
    (url: string) => new PrismaClient({ datasources: { db: { url } } }),
    { connectionLimit: 3, poolTimeout: 10, writeUrl: process.env.SEARCH_DATABASE_URL }
  );
}

export type SearchPrisma = ReturnType<typeof createSearchPrisma>;
