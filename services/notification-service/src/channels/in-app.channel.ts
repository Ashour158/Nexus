import type { NotificationPrisma } from '../prisma.js';
import { tenantAls } from '../prisma.js';
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
  /**
   * Source Kafka `eventId` (RR-H4). When provided, the in-app write becomes
   * idempotent: the persisted `dedupKey` is derived as `eventId:userId:type`, so
   * a handler retry or DLQ replay of the same event reuses the same key and the
   * `@@unique([tenantId, dedupKey])` constraint collapses the duplicate instead
   * of inserting a second inbox row. Omit it and the legacy create-every-time
   * behaviour is preserved.
   */
  eventId?: string;
  /**
   * Explicit idempotency key. Overrides the `eventId`-derived key when a caller
   * wants full control. Leave both unset for non-idempotent creates.
   */
  dedupKey?: string;
}

export interface InAppChannel {
  send(input: InAppNotificationInput): Promise<{ id: string }>;
}

export function createInAppChannel(prisma: NotificationPrisma, producer?: NexusProducer): InAppChannel {
  return {
    async send(input) {
      // Seed the tenant ALS for the whole write.
      //
      // Every caller is a Kafka consumer, which has no HTTP request context — and
      // the shared tenant Prisma extension THROWS (TenantContextError) when the
      // ALS store is empty rather than no-op'ing as prisma.ts's comment assumed.
      // The result: every in-app notification write threw, retried 3x, and was
      // dropped. The service looked healthy (9 consumers Stable, lag 0) and had
      // produced ZERO notifications. `input.tenantId` is already required on this
      // interface, so the context is right here — seed it rather than turning
      // enforcement off.
      return tenantAls.run({ tenantId: input.tenantId }, () => sendInner(input));
    },
  };

  async function sendInner(input: InAppNotificationInput): Promise<{ id: string }> {
      // RR-H4: derive a stable dedup key so at-least-once event delivery (retry
      // / DLQ replay) cannot create duplicate inbox rows. `eventId:userId:type`
      // keeps distinct notifications to the same user (e.g. two stage changes)
      // separate while collapsing re-runs of the same event.
      const dedupKey =
        input.dedupKey ??
        (input.eventId ? `${input.eventId}:${input.userId}:${input.type}` : undefined);

      const data = {
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
        dedupKey: dedupKey ?? null,
      };

      let row: { id: string };
      if (dedupKey) {
        // NOTE: query by plain fields, NOT the `tenantId_dedupKey` compound-unique
        // shorthand, and create-then-catch instead of upsert.
        //
        // The shared tenant extension remaps findUnique -> findFirst, and merges a
        // bare `tenantId` into an upsert's where. Neither accepts the compound
        // shorthand Prisma generates for `@@unique([tenantId, dedupKey])`, so both
        // forms died with `Unknown argument 'tenantId_dedupKey'` — every in-app
        // notification threw, retried 3x, and was dropped. (The constraint itself
        // is real and present in the DB; only the query syntax was incompatible.)
        //
        // A prior replay of this event already persisted the row — reuse it and
        // suppress the realtime re-publish so the client isn't double-notified.
        const existing = await prisma.notification.findFirst({
          where: { tenantId: input.tenantId, dedupKey },
          select: { id: true },
        });
        if (existing) {
          return { id: existing.id };
        }
        try {
          row = await prisma.notification.create({ data, select: { id: true } });
        } catch (err) {
          // A concurrent replay raced the check above and won. The DB's unique
          // index is the real guard — treat its violation as "already delivered"
          // and return the winner's row rather than throwing.
          if ((err as { code?: string })?.code === 'P2002') {
            const winner = await prisma.notification.findFirst({
              where: { tenantId: input.tenantId, dedupKey },
              select: { id: true },
            });
            if (winner) return { id: winner.id };
          }
          throw err;
        }
      } else {
        row = await prisma.notification.create({ data, select: { id: true } });
      }

      // Publish to Kafka so realtime-service can push via WebSocket. Reached only
      // for a genuinely new row — a replay early-returns above without publishing.
      if (producer) {
        // Recipient's current unread count so realtime-service can update the
        // badge. Fail-open: a count failure must not block the notification.
        let unreadCount: number | undefined;
        try {
          unreadCount = await prisma.notification.count({
            where: { tenantId: input.tenantId, userId: input.userId, isRead: false },
          });
        } catch { /* non-critical — badge just won't refresh this time */ }

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
            unreadCount,
          },
        }).catch(() => { /* non-critical — DB write already succeeded */ });
      }

      return { id: row.id };
  }
}
