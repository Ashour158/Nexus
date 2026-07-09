import { PrismaClient } from '../../../node_modules/.prisma/finance-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { alsStore } from './request-context.js';

/**
 * Tenant isolation — Section 35.1 semantics via Prisma 5 `$extends`.
 *
 * Every finance model carries `tenantId` directly EXCEPT the `Account`
 * read-model which is populated by cross-service events and whose `id` is
 * the primary scoping key. Join-table rows are scoped through their parent.
 */
const skipTenantModels = new Set<string>();

export function createFinancePrisma() {
  const base = createPrismaClientWithReplicas(
    (url: string) =>
      new PrismaClient({
        datasources: {
          db: { url },
        },
      }),
    { connectionLimit: 5, poolTimeout: 10 }
  );

  return base.$extends(
    createTenantPrismaExtension(base, {
      getTenantId: () => alsStore.get('tenantId') as string | undefined,
      skipModels: skipTenantModels,
    })
  );
}

export type FinancePrisma = ReturnType<typeof createFinancePrisma>;
