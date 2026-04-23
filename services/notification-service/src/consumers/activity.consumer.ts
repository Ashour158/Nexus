import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';

interface ActivityConsumerDeps {
  inApp: InAppChannel;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Activity events → in-app reminders. `activity.created` issues a reminder for
 * the owner if the due date is in the past or within 24 hours.
 * `activity.completed` writes a light-weight audit notification to the owner.
 */
export async function startActivityConsumer(
  deps: ActivityConsumerDeps
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.activities');

  consumer.on('activity.created', async (event) => {
    if (event.type !== 'activity.created') return;
    const { payload } = event;
    const dueMs = payload.dueDate ? new Date(payload.dueDate).getTime() : null;
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    const needsReminder =
      dueMs !== null && (dueMs < now || dueMs <= in24h);
    if (!needsReminder) return;
    const overdue = dueMs !== null && dueMs < now;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: payload.ownerId,
      type: overdue ? 'activity.overdue' : 'activity.upcoming',
      title: overdue ? '⚠️ Activity overdue' : '⏰ Activity due soon',
      body: `${payload.type} activity ${payload.activityId} ${
        overdue ? 'is past due.' : 'is due within 24 hours.'
      }`,
      entityType: 'Activity',
      entityId: payload.activityId,
      actionUrl: payload.dealId ? `/deals/${payload.dealId}` : '/activities',
      metadata: { type: payload.type, dueDate: payload.dueDate },
    });
  });

  consumer.on('activity.completed', async (event) => {
    if (event.type !== 'activity.completed') return;
    const { payload } = event;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: payload.ownerId,
      type: 'activity.completed',
      title: '✅ Activity completed',
      body: `${payload.type} ${payload.activityId} marked complete${
        payload.outcome ? `: ${payload.outcome}` : ''
      }.`,
      entityType: 'Activity',
      entityId: payload.activityId,
      actionUrl: payload.dealId ? `/deals/${payload.dealId}` : '/activities',
    });
  });

  await consumer.subscribe([TOPICS.ACTIVITIES]);
  await consumer.start();
  return consumer;
}
