import { PrismaClient } from '../../../node_modules/.prisma/cadence-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export type CadencePrisma = ReturnType<typeof buildPrisma>;

function buildPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CADENCE_DATABASE_URL }),
      },
    },
    log: ['error', { emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(base as any, 'cadence-service');
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId,
      skipModels: new Set(['CadenceStep', 'StepExecution']),
    })
  );
}

let prisma: CadencePrisma | null = null;

export function getPrisma(): CadencePrisma {
  if (!prisma) {
    prisma = buildPrisma();
  }
  return prisma;
}
