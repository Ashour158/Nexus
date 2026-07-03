import { PrismaClient } from '../../../node_modules/.prisma/deals-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export function createDealsPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.DEALS_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(base as any, 'deals-service');
  // Tenant extension is defense-in-depth: a NO-OP when there is no request
  // context. Cast back to the base client type so consumers keep the exact
  // Prisma types (the extended client is a structural superset at runtime).
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId,
      skipModels: new Set(['DealContact', 'MutualActionItem', 'DealRoomDocument']),
    })
  ) as unknown as PrismaClient;
}

export type DealsPrisma = PrismaClient;
