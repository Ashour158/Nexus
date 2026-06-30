import { PrismaClient } from '../../../node_modules/.prisma/auth-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { withFieldEncryption } from '@nexus/security';
import { attachSlowQueryLog } from '@nexus/service-utils/db';
import { alsStore } from './request-context.js';

/**
 * Tenant isolation — Section 35.1 semantics via Prisma 5 `$extends`.
 * Models without `tenantId` and global `Tenant` are excluded.
 */
const skipTenantModels = new Set(['Tenant', 'Session', 'UserRole']);

export function createAuthPrisma() {
  const base = createPrismaClientWithReplicas(
    (url: string) => {
      const client = new PrismaClient({
        datasources: { db: { url } },
        log: [{ emit: 'event', level: 'query' }],
      });
      attachSlowQueryLog(client as any, 'auth-service');
      return client;
    },
    { connectionLimit: 5, poolTimeout: 10 }
  );

  // Wire field-level encryption for PII fields (GDPR Art. 32 compliance)
  const encryptionKey = process.env.ENCRYPTION_MASTER_KEY;
  if (encryptionKey && encryptionKey.length >= 32) {
    withFieldEncryption(base as any, encryptionKey, [
      { model: 'User', fields: ['email', 'phone', 'firstName', 'lastName'] },
      { model: 'UserProfile', fields: ['personalEmail', 'emergencyPhone', 'address', 'dateOfBirth'] },
      { model: 'SsoConfiguration', fields: ['certificate'] },
      { model: 'MfaConfiguration', fields: ['secret'] },
    ]);
  }

  return base.$extends(
    createTenantPrismaExtension(base, {
      getTenantId: () => alsStore.get('tenantId') as string | undefined,
      skipModels: skipTenantModels,
    })
  );
}

export type AuthPrisma = ReturnType<typeof createAuthPrisma>;
