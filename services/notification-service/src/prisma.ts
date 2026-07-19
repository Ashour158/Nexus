import { getTenantId as getSharedTenantId } from '@nexus/service-utils/request-context';
import { PrismaClient } from '../../../node_modules/.prisma/notification-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Notification service Prisma client.
 *
 * Notifications are always written from Kafka consumers that already know the
 * acting `tenantId` and pass it explicitly on every query. Queries are wrapped
 * with the shared tenant Prisma extension as defense-in-depth.
 *
 * ⚠️ The extension is NOT a no-op without a request context: with enforcement on
 * (the default — this service does not set NEXUS_TENANT_ENFORCEMENT=off) it
 * THROWS TenantContextError when the ALS store is empty. This file previously
 * claimed the opposite, and on that assumption the Kafka consumers never seeded
 * the ALS — so every notification write threw, retried 3x and was dropped, and
 * the service produced ZERO notifications while looking perfectly healthy.
 *
 * Any code path that touches this client MUST run inside `tenantAls.run(...)`.
 * The consumer path does so in channels/in-app.channel.ts; the HTTP path does so
 * via the preHandler in index.ts.
 */

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export function createNotificationPrisma() {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.NOTIFICATION_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(base as any, 'notification-service');
  return base.$extends(
    createTenantPrismaExtension(base as any, {
      getTenantId: () => tenantAls.getStore()?.tenantId ?? getSharedTenantId(),
      skipModels: new Set([]),
    })
  );
}

export type NotificationPrisma = ReturnType<typeof createNotificationPrisma>;
