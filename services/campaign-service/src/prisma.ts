import { PrismaClient } from '../../../node_modules/.prisma/campaign-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export type CampaignPrisma = ReturnType<typeof buildPrisma>;

function buildPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CAMPAIGN_DATABASE_URL }),
      },
    },
    log: ['error', { emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(base as any, 'campaign-service');
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId,
      skipModels: new Set(['OutboxMessage']),
    })
  );
}

let prisma: CampaignPrisma | null = null;

export function getPrisma(): CampaignPrisma {
  if (!prisma) {
    prisma = buildPrisma();
  }
  return prisma;
}
