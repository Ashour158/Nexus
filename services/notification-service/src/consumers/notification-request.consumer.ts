import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import { renderActionEmail } from '../channels/email.channel.js';
import type { PreferencesService } from '../services/preferences.service.js';

interface OwnerLookup {
  (
    tenantId: string,
    userId: string
  ): Promise<{ email?: string; name?: string; phone?: string; deviceToken?: string }>;
}

interface NotificationRequestDeps {
  inApp: InAppChannel;
  email: EmailChannel;
  prefs: PreferencesService;
  lookupOwner: OwnerLookup;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Payload shape of the generic `notification.requested` event. Published by
 * services that want to *request* a notification without owning delivery —
 * currently workflow-service's automation NOTIFY/EMAIL actions and
 * finance-service's auto-quote `send_notification`. Not part of the shared
 * `NexusKafkaEvent` union, so it is read defensively and tolerates both the
 * `recipientId`/`title`/`body` and `userId`/`subject`/`message` variants.
 */
interface NotificationRequestedPayload {
  channel?: string;
  recipientId?: string;
  userId?: string;
  to?: string;
  notificationType?: string;
  title?: string;
  subject?: string;
  template?: string;
  body?: string;
  message?: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/**
 * `notification.requested` → real delivery. Persists an in-app notification for
 * the recipient (which the in-app channel re-publishes as `notification.created`
 * so realtime-service pushes a WebSocket frame) and, when the requested channel
 * is `email`, sends an email via the SMTP channel (resolving the address from an
 * explicit `to`, else from `recipientId` via the auth-service).
 *
 * The NexusConsumer dedupes by eventId; required fields are guarded so a
 * malformed event can never throw and stall the loop. Genuine email-send
 * failures propagate so the consumer's retry/DLQ path fires (NOT-05).
 */
export async function startNotificationRequestConsumer(
  deps: NotificationRequestDeps
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.notification-requests');

  consumer.on('notification.requested' as never, (async (event: {
    tenantId: string;
    payload?: unknown;
  }) => {
    const payload = (event.payload ?? {}) as NotificationRequestedPayload;
    const recipientId = firstString(payload.recipientId, payload.userId);
    const explicitTo = firstString(payload.to);
    if (!recipientId && !explicitTo) {
      deps.log.warn({ tenantId: event.tenantId }, 'notification.requested skipped: no recipient');
      return;
    }

    const channel = (payload.channel ?? 'in_app').toLowerCase();
    const type = firstString(payload.notificationType) ?? 'workflow.notification';
    const title = firstString(payload.title, payload.subject, payload.template) ?? 'Notification';
    const body = firstString(payload.body, payload.message) ?? '';
    const actionUrl = firstString(payload.actionUrl);

    // Always persist an in-app copy when we know the recipient user — it is the
    // durable, always-available delivery surface (the bell + realtime badge).
    if (recipientId) {
      await deps.inApp.send({
        tenantId: event.tenantId,
        userId: recipientId,
        type,
        title,
        body,
        entityType: payload.entityType,
        entityId: payload.entityId,
        actionUrl,
        metadata: payload.metadata ?? {},
      });
    }

    // Email fan-out when explicitly requested. Address from `to`, else resolved
    // from the recipient user. Preference check is fail-open + only applies when
    // we have a recipient user id to look preferences up against.
    if (channel === 'email') {
      let to = explicitTo;
      if (!to && recipientId) {
        const owner = await deps.lookupOwner(event.tenantId, recipientId);
        to = owner.email;
      }
      if (!to) {
        deps.log.warn({ tenantId: event.tenantId, recipientId }, 'notification.requested email skipped: no address');
        return;
      }
      const emailOn = recipientId
        ? await deps.prefs.isChannelEnabled(event.tenantId, recipientId, 'EMAIL')
        : true;
      if (!emailOn) return;
      await deps.email.send({
        to,
        subject: firstString(payload.subject, payload.title) ?? title,
        html: renderActionEmail({
          heading: title,
          body,
          actionLabel: actionUrl ? 'Open' : undefined,
          actionUrl,
        }),
      });
    }
  }) as never);

  await consumer.subscribe([TOPICS.NOTIFICATIONS]);
  await consumer.start();
  return consumer;
}
