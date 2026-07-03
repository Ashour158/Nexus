import { PrismaClient } from '../../../node_modules/.prisma/contacts-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { withFieldEncryption } from '@nexus/security';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export function createContactsPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CONTACTS_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  const encryptionKey = process.env.ENCRYPTION_MASTER_KEY;
  if (encryptionKey && encryptionKey.length >= 32) {
    withFieldEncryption(base, encryptionKey, [
      { model: 'Contact', fields: ['email', 'phone'] },
    ]);
  }
  attachSlowQueryLog(base as any, 'contacts-service');
  // Tenant extension is defense-in-depth: a NO-OP when there is no request
  // context. Cast back to the base client type so consumers keep the exact
  // Prisma types (the extended client is a structural superset at runtime).
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId,
      skipModels: new Set([]),
    })
  ) as unknown as PrismaClient;
}

export type ContactsPrisma = PrismaClient;
