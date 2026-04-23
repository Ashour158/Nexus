import type { NotificationPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/notification-client/index.js';

/**
 * In-app channel — persists a notification row so the web client can render it
 * in the bell dropdown. Entity linkage is optional but recommended; it is what
 * drives the `View` action in the UI.
 */

export interface InAppNotificationInput {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InAppChannel {
  send(input: InAppNotificationInput): Promise<{ id: string }>;
}

export function createInAppChannel(prisma: NotificationPrisma): InAppChannel {
  return {
    async send(input) {
      const row = await prisma.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          actionUrl: input.actionUrl ?? null,
          channel: 'IN_APP',
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      return { id: row.id };
    },
  };
}
