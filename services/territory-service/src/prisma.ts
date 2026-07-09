import { PrismaClient } from '../../../node_modules/.prisma/territory-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export type TerritoryPrisma = PrismaClient & { $read: PrismaClient };
let prisma: TerritoryPrisma | null = null;

export function getPrisma(): TerritoryPrisma {
  if (!prisma) {
    const base = createPrismaClientWithReplicas(
      (url: string) =>
        new PrismaClient({
          datasources: {
            db: { url },
          },
          log: ['error'],
        }),
      { connectionLimit: 5, poolTimeout: 10 }
    );
    prisma = base.$extends(
      createTenantPrismaExtension(base as any, {
        getTenantId: () => tenantAls.getStore()?.tenantId,
        skipModels: new Set(['TerritoryRule']),
      })
    ) as unknown as TerritoryPrisma;
  }
  return prisma;
}
