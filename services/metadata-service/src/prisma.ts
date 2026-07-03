import { PrismaClient } from '../../../node_modules/.prisma/metadata-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export function createMetadataPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.METADATA_DATABASE_URL }),
      },
    },
  });
  // Tenant extension is defense-in-depth: a NO-OP when there is no request
  // context. Cast back to the base client type so consumers keep the exact
  // Prisma types (the extended client is a structural superset at runtime).
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId,
      skipModels: new Set(['DuplicateRecord']),
    })
  ) as unknown as PrismaClient;
}

export type MetadataPrisma = PrismaClient;
