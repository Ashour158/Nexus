import type { NotificationPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/notification-client/index.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';

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

export function createInAppChannel(prisma: NotificationPrisma, producer?: NexusProducer): InAppChannel {
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

      // Publish to Kafka so realtime-service can push via WebSocket
      if (producer) {
        producer.publish(TOPICS.NOTIFICATIONS, {
          type: 'notification.created',
          version: 1,
          tenantId: input.tenantId,
          timestamp: new Date().toISOString(),
          payload: {
            id: row.id,
            userId: input.userId,
            notificationType: input.type,
            title: input.title,
            body: input.body,
            entityType: input.entityType,
            entityId: input.entityId,
            actionUrl: input.actionUrl,
          },
        }).catch(() => { /* non-critical — DB write already succeeded */ });
      }

      return { id: row.id };
    },
  };
}
