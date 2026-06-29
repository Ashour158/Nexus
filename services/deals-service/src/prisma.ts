import { PrismaClient } from '../../../node_modules/.prisma/deals-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export function createDealsPrisma() {
  return new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.DEALS_DATABASE_URL }),
      },
    },
  });
}

export type DealsPrisma = ReturnType<typeof createDealsPrisma>;
