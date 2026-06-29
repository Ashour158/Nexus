import { PrismaClient } from '../../../node_modules/.prisma/notification-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

/**
 * Notification service Prisma client.
 *
 * Unlike the CRM and Finance services, notifications are always written from
 * Kafka consumers that already know the acting `tenantId`, so we skip the
 * ALS-based auto-injection wrapper and rely on callers to pass `tenantId`
 * explicitly on every query. This keeps the consumer code simpler and avoids
 * an implicit dependency on a Fastify request context for background work.
 */

export function createNotificationPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.NOTIFICATION_DATABASE_URL }),
      },
    },
  });
}

export type NotificationPrisma = PrismaClient;
