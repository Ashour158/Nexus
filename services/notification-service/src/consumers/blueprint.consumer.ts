import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';

interface BlueprintConsumerDeps {
  inApp: InAppChannel;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Payloads for the user-facing blueprint events. blueprint-service publishes
 * these across two topics and, before this consumer, NOTHING turned them into
 * notifications:
 *   - `blueprint.stage.notification` / `blueprint.transition.notification` are
 *     published on TOPICS.NOTIFICATIONS (see stage-actions.service.ts /
 *     transition-actions.service.ts). The existing notification-request consumer
 *     shares that topic but only registers a `notification.requested` handler, so
 *     these two event *types* had no handler and were silently dropped.
 *   - `blueprint.sla.breached` is published on TOPICS.BLUEPRINT (see
 *     workers/sla-poller.ts) and NO service subscribed to that topic at all.
 *
 * None of these are part of the shared `NexusKafkaEvent` union, so we read them
 * defensively. This consumer runs under its own group id, so subscribing to
 * TOPICS.NOTIFICATIONS does not compete with the notification-request consumer —
 * each group receives its own copy and only acts on the types it registers.
 */
interface StageNotificationPayload {
  userId?: string;
  dealId?: string;
  stageId?: string;
  title?: string;
  body?: string;
}

interface TransitionNotificationPayload {
  userId?: string;
  roles?: string[];
  module?: string;
  recordId?: string;
  stageId?: string;
  transitionId?: string;
  title?: string;
  body?: string;
}

interface SlaBreachedPayload {
  module?: string;
  recordId?: string;
  playbookId?: string;
  stageId?: string;
  transitionId?: string;
  slaDueAt?: string | null;
  breachedAt?: string;
  // The current sla-poller payload carries no recipient, but tolerate the common
  // owner/notify shapes in case a future emitter adds them, so we can notify a
  // concrete user rather than dropping the breach.
  ownerId?: string;
  userId?: string;
  notifyUserIds?: string[];
}

/** Lower-cases a module name into a plural route segment, e.g. `Deal` -> `deals`. */
function modulePath(module: string): string {
  const m = module.toLowerCase();
  return m.endsWith('s') ? m : `${m}s`;
}

/**
 * Blueprint (playbook / stage-transition / SLA) events → in-app notifications.
 *
 * Handles the three user-facing blueprint events; the pure lifecycle events
 * (`blueprint.transition.created`, `blueprint.transition.completed`,
 * `blueprint.transition.function`, `blueprint.playbook.*`, `blueprint.stage.upserted`)
 * are intentionally NOT handled — they are automation/audit signals, not
 * end-user alerts.
 *
 * Subscribes to TOPICS.BLUEPRINT + TOPICS.NOTIFICATIONS. The NexusConsumer
 * dispatches by `event.type`, so unregistered types on either topic are no-ops.
 * The in-app channel dedupes on `eventId` (RR-H4); every handler guards on its
 * required fields so a malformed or irrelevant event can never throw and stall
 * the loop.
 */
export async function startBlueprintConsumer(
  deps: BlueprintConsumerDeps
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.blueprint');

  // Playbook stage entry → notify the target user (owner by default). Published
  // on TOPICS.NOTIFICATIONS by stage-actions.service.ts `runSendNotification`.
  consumer.on('blueprint.stage.notification', async (event) => {
    const evt = event as { tenantId: string; eventId?: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as StageNotificationPayload;
    if (!payload.userId) return;
    const title = payload.title ?? 'Playbook update';
    const body = payload.body ?? 'A playbook stage was entered.';
    await deps.inApp.send({
      eventId: evt.eventId,
      tenantId: evt.tenantId,
      userId: payload.userId,
      type: 'BLUEPRINT_STAGE',
      title,
      body,
      entityType: 'Deal',
      entityId: payload.dealId,
      actionUrl: payload.dealId ? `/deals/${payload.dealId}` : undefined,
      metadata: { stageId: payload.stageId },
    });
  });

  // Transition alert action → notify the target user. Published on
  // TOPICS.NOTIFICATIONS by transition-actions.service.ts `runAlert`. Role-only
  // alerts (no concrete `userId`) are delivered by other means; without a user
  // id there is no inbox to write to, so skip cleanly.
  consumer.on('blueprint.transition.notification', async (event) => {
    const evt = event as { tenantId: string; eventId?: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as TransitionNotificationPayload;
    if (!payload.userId) return;
    const module = payload.module ?? 'record';
    const title = payload.title ?? 'Blueprint transition';
    const body = payload.body ?? `A ${module} record moved to a new stage.`;
    await deps.inApp.send({
      eventId: evt.eventId,
      tenantId: evt.tenantId,
      userId: payload.userId,
      type: 'BLUEPRINT_TRANSITION',
      title,
      body,
      entityType: module,
      entityId: payload.recordId,
      actionUrl: payload.recordId ? `/${modulePath(module)}/${payload.recordId}` : undefined,
      metadata: { stageId: payload.stageId, transitionId: payload.transitionId },
    });
  });

  // SLA breach on a blueprint stage/transition → alert the record's owner(s).
  // Published on TOPICS.BLUEPRINT by workers/sla-poller.ts. Note: the per-user
  // SLA escalation alerts (`escalationConfig.notifyUserIds` / `notifyRoles` /
  // `alerts`) are emitted separately by sla-poller -> executeEscalation ->
  // runAlert as `blueprint.transition.notification` events, which the handler
  // above already turns into notifications. This handler covers the raw breach
  // event: it only writes an inbox row when the payload names a concrete
  // recipient (a user we can key the row to). The current poller payload has
  // none, so this is a clean no-op today, but it is future-proof — and, unlike
  // an empty-userId write, it never persists an unreadable row.
  consumer.on('blueprint.sla.breached', async (event) => {
    const evt = event as { tenantId: string; eventId?: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as SlaBreachedPayload;
    if (!payload.recordId) return;
    const recipients = Array.from(
      new Set(
        [payload.ownerId, payload.userId, ...(payload.notifyUserIds ?? [])].filter(
          (v): v is string => typeof v === 'string' && v.length > 0
        )
      )
    );
    if (recipients.length === 0) return;
    const module = payload.module ?? 'record';
    const title = '⏳ Blueprint SLA breached';
    const body = `A blueprint SLA was breached on ${module} ${payload.recordId}. It needs attention.`;
    for (const userId of recipients) {
      await deps.inApp.send({
        eventId: evt.eventId,
        tenantId: evt.tenantId,
        userId,
        type: 'BLUEPRINT_SLA_BREACHED',
        title,
        body,
        entityType: module,
        entityId: payload.recordId,
        actionUrl: `/${modulePath(module)}/${payload.recordId}`,
        metadata: {
          playbookId: payload.playbookId,
          stageId: payload.stageId,
          transitionId: payload.transitionId,
          slaDueAt: payload.slaDueAt ?? undefined,
          breachedAt: payload.breachedAt,
        },
      });
    }
  });

  await consumer.subscribe([TOPICS.BLUEPRINT, TOPICS.NOTIFICATIONS]);
  await consumer.start();
  return consumer;
}
