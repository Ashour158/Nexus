import { PrismaClient } from '../../../node_modules/.prisma/billing-client/index.js';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { alsStore } from './request-context.js';

export function createBillingPrisma() {
  const base = new PrismaClient({
    datasources: { db: { url: process.env.BILLING_DATABASE_URL } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return base.$extends(
    createTenantPrismaExtension(base, {
      getTenantId: () => alsStore.get('tenantId') as string | undefined,
      skipModels: new Set<string>(),
    })
  );
}

export type BillingPrisma = ReturnType<typeof createBillingPrisma>;
