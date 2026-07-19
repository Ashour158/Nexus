import { getTenantId as getSharedTenantId } from '@nexus/service-utils/request-context';
import { PrismaClient } from '../../../node_modules/.prisma/planning-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export type PlanningPrisma = ReturnType<typeof buildPrisma>;

function buildPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.PLANNING_DATABASE_URL }),
      },
    },
    log: ['error', { emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(base as any, 'planning-service');
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId ?? getSharedTenantId(),
      skipModels: new Set(['ForecastReview']),
    })
  );
}

let prisma: PlanningPrisma | null = null;

export function getPrisma(): PlanningPrisma {
  if (!prisma) {
    prisma = buildPrisma();
  }
  return prisma;
}
