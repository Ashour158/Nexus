import { PrismaClient } from '../../../node_modules/.prisma/deals-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';

export function createDealsPrisma() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.DEALS_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(prisma as any, 'deals-service');
  return prisma;
}

export type DealsPrisma = ReturnType<typeof createDealsPrisma>;
