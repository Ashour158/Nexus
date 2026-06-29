import { PrismaClient } from '../../../node_modules/.prisma/integration-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { alsStore } from './request-context.js';

const skipTenantModels = new Set<string>();

export function createIntegrationPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.INTEGRATION_DATABASE_URL }),
      },
    },
  });
  return base.$extends(
    createTenantPrismaExtension(base, {
      getTenantId: () => alsStore.get('tenantId') as string | undefined,
      skipModels: skipTenantModels,
    })
  );
}

export type IntegrationPrisma = ReturnType<typeof createIntegrationPrisma>;
