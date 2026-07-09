import { PrismaClient } from '../../../node_modules/.prisma/activities-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export function createActivitiesPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.ACTIVITIES_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(base as any, 'activities-service');
  // Tenant extension is defense-in-depth: a NO-OP when there is no request
  // context. Cast back to the base client type so consumers keep the exact
  // Prisma types (the extended client is a structural superset at runtime).
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId,
      skipModels: new Set(['EmailMessage']),
    })
  ) as unknown as PrismaClient;
}

export type ActivitiesPrisma = PrismaClient;
