import { TOPICS } from '@nexus/kafka';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * EMAIL → publish a `notification.requested` event (channel `email`) on the
 * platform notifications topic. notification-service's notification-request
 * consumer sends the email via the SMTP channel (resolving the recipient address
 * from `to`, or from `recipientId` via the auth-service when `to` is omitted) and
 * also persists an in-app copy. Replaces the previous POST to a nonexistent
 * notification-service HTTP route.
 */
export async function handleEmailNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    to?: string;
    toField?: string;
    recipientIdField?: string;
    subject?: string;
    body?: string;
    actionUrl?: string;
  };
  if (!context.producer) return { output: { skipped: true, reason: 'no_producer' } };

  const to =
    cfg.to ??
    (cfg.toField ? String(context.triggerPayload[cfg.toField] ?? '') || undefined : undefined);
  const recipientId = cfg.recipientIdField
    ? String(context.triggerPayload[cfg.recipientIdField] ?? '') || undefined
    : String(context.triggerPayload.ownerId ?? '') || undefined;
  if (!to && !recipientId) return { output: { skipped: true, reason: 'missing_recipient' } };

  await context.producer.publish(TOPICS.NOTIFICATIONS, {
    type: 'notification.requested',
    tenantId: context.tenantId,
    payload: {
      channel: 'email',
      to,
      recipientId,
      notificationType: 'workflow.email',
      title: cfg.subject ?? 'Workflow email',
      subject: cfg.subject ?? 'Workflow email',
      body: cfg.body ?? '',
      actionUrl: cfg.actionUrl,
      metadata: { executionId: context.executionId, workflowId: context.workflowId },
    },
  });

  return { output: { delivered: 'notification.requested', channel: 'email', to: to ?? null, recipientId: recipientId ?? null } };
}
