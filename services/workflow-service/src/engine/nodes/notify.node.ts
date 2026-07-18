import { TOPICS } from '@nexus/kafka';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * NOTIFY → publish a `notification.requested` event on the platform notifications
 * topic. notification-service's notification-request consumer persists the in-app
 * row (and fans out to email/SMS/push per the recipient's channel preferences),
 * so the alert actually reaches the user — unlike the previous unauthenticated
 * HTTP POST to a route that did not exist.
 */
export async function handleNotifyNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    userIdField?: string;
    title?: string;
    body?: string;
    actionUrl?: string;
    entityType?: string;
    entityIdField?: string;
  };
  const userId = String(context.triggerPayload[cfg.userIdField ?? 'ownerId'] ?? '');
  if (!userId) return { output: { skipped: true, reason: 'missing_recipient' } };
  if (!context.simulate && !context.producer) return { output: { skipped: true, reason: 'no_producer' } };

  const entityId = cfg.entityIdField
    ? String(context.triggerPayload[cfg.entityIdField] ?? '') || undefined
    : undefined;

  // AU-5: forward the incremented cause-chain depth so any rule listening on the
  // resulting event sees the running depth (loop guard).
  const nextDepth = (context.causationDepth ?? 0) + 1;
  const event = {
    type: 'notification.requested',
    tenantId: context.tenantId,
    causationDepth: nextDepth,
    ...(context.rootEventId ? { rootEventId: context.rootEventId } : {}),
    payload: {
      channel: 'in_app',
      recipientId: userId,
      notificationType: 'workflow.notify',
      title: cfg.title ?? 'Workflow notification',
      body: cfg.body ?? 'Workflow step executed',
      actionUrl: cfg.actionUrl,
      entityType: cfg.entityType,
      entityId,
      metadata: { executionId: context.executionId, workflowId: context.workflowId },
    },
  };

  // Dry-run (AU-3): describe the event that would be published; do not publish.
  if (context.simulate) {
    return { output: { simulated: true, wouldPublish: { topic: TOPICS.NOTIFICATIONS, event } } };
  }

  await context.producer!.publish(TOPICS.NOTIFICATIONS, event);

  return { output: { delivered: 'notification.requested', recipientId: userId, channel: 'in_app' } };
}
