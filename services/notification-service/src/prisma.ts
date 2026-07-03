import { PrismaClient } from '../../../node_modules/.prisma/notification-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Notification service Prisma client.
 *
 * Notifications are always written from Kafka consumers that already know the
 * acting `tenantId` and pass it explicitly on every query. As defense-in-depth,
 * request-path queries are additionally wrapped with the shared tenant Prisma
 * extension. The extension is a NO-OP when there is no request context (the
 * ALS store is empty), so background consumers are unaffected — callers still
 * pass `tenantId` explicitly there.
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
      getTenantId: () => tenantAls.getStore()?.tenantId,
      skipModels: new Set([]),
    })
  );
}

export type NotificationPrisma = ReturnType<typeof createNotificationPrisma>;
