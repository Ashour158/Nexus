import { PrismaClient } from '../../../node_modules/.prisma/blueprint-client/index.js';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { alsStore } from './request-context.js';

const skipTenantModels = new Set<string>();

export function createBlueprintPrisma(base: PrismaClient) {
  return base.$extends(
    createTenantPrismaExtension(base, {
      getTenantId: () => alsStore.get('tenantId') as string | undefined,
      skipModels: skipTenantModels,
    })
  );
}

export type BlueprintPrisma = ReturnType<typeof createBlueprintPrisma>;

