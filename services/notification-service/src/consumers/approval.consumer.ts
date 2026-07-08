import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';

interface ApprovalConsumerDeps {
  inApp: InAppChannel;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Payloads for the approval events approval-service publishes on TOPICS.WORKFLOWS
 * (see services/approval-service/src/services/requests.service.ts). These are not
 * part of the shared NexusKafkaEvent union, so we read them defensively.
 */
interface ApprovalCreatedPayload {
  requestId?: string;
  module?: string;
  recordId?: string;
  approverIds?: string[];
}
interface ApprovalEscalatedPayload {
  requestId?: string;
  approverId?: string;
  escalatedTo?: string;
}
interface ApprovalDecisionPayload {
  requestId?: string;
  /** userId of the person who raised the request (added by approval-service, NOT-01). */
  requestedBy?: string;
  module?: string;
  recordId?: string;
  comment?: string;
}

/**
 * Approval events → in-app notifications for the approver(s) (NOT-14). Before this
 * consumer, approval-service published `approval.request.created` / `escalated` on
 * TOPICS.WORKFLOWS but nothing turned them into notifications, so approvers were
 * never alerted. Each notification links to the approvals inbox.
 *
 * Subscribes to TOPICS.WORKFLOWS and handles only the approval.* events. The
 * NexusConsumer dedupes by eventId; we guard on required fields so a malformed
 * event can never throw and stall the loop.
 */
export async function startApprovalConsumer(deps: ApprovalConsumerDeps): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.approvals');

  consumer.on('approval.request.created', async (event) => {
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as ApprovalCreatedPayload;
    const approvers = Array.from(new Set((payload.approverIds ?? []).filter(Boolean)));
    if (approvers.length === 0) return;
    const module = payload.module ?? 'record';
    for (const userId of approvers) {
      await deps.inApp.send({
        tenantId: evt.tenantId,
        userId,
        type: 'APPROVAL_REQUEST',
        title: 'Approval required',
        body: `A ${module} needs your approval.`,
        entityType: 'approval',
        entityId: payload.requestId,
        actionUrl: '/approvals',
        metadata: { requestId: payload.requestId, module, recordId: payload.recordId },
      });
    }
  });

  consumer.on('approval.request.escalated', async (event) => {
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as ApprovalEscalatedPayload;
    const target = payload.escalatedTo ?? payload.approverId;
    if (!target) return;
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: target,
      type: 'APPROVAL_REQUEST',
      title: 'Approval escalated to you',
      body: 'An approval request was escalated and needs your attention.',
      entityType: 'approval',
      entityId: payload.requestId,
      actionUrl: '/approvals',
      metadata: { requestId: payload.requestId, escalated: true },
    });
  });

  // A decision (approved / rejected) → notify the requester (NOT-01). Before this,
  // approval-service published `approval.request.approved` / `.rejected` but nothing
  // consumed them, so the person who raised the request was never told the outcome.
  // The `requestedBy` field is now carried on the payload (see approval-service
  // requests.service.ts). Guard on it so a legacy/malformed event can never throw.
  const notifyRequester = async (
    event: unknown,
    outcome: 'approved' | 'rejected'
  ): Promise<void> => {
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as ApprovalDecisionPayload;
    const requester = payload.requestedBy;
    if (!requester) return;
    const module = payload.module ?? 'record';
    const approved = outcome === 'approved';
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: requester,
      type: approved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      title: approved ? 'Approval granted' : 'Approval rejected',
      body: approved
        ? `Your ${module} request was approved.`
        : `Your ${module} request was rejected${payload.comment ? `: ${payload.comment}` : '.'}`,
      entityType: 'approval',
      entityId: payload.requestId,
      actionUrl: '/approvals',
      metadata: {
        requestId: payload.requestId,
        module,
        recordId: payload.recordId,
        outcome,
      },
    });
  };

  consumer.on('approval.request.approved', (event) => notifyRequester(event, 'approved'));
  consumer.on('approval.request.rejected', (event) => notifyRequester(event, 'rejected'));

  await consumer.subscribe([TOPICS.WORKFLOWS]);
  await consumer.start();
  return consumer;
}
