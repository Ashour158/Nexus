import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { createExecutionsService } from '../services/executions.service.js';

/**
 * Approval resume consumer.
 *
 * The APPROVAL_REQUEST node pauses a workflow execution (status PAUSED,
 * currentNodeId = approval node) and asks approval-service to create an
 * approval request. When that request is approved or rejected, approval-service
 * publishes `approval.request.approved` / `approval.request.rejected` on the
 * WORKFLOWS topic. This consumer catches those events, correlates them back to
 * the paused execution, and resumes it down the approved/rejected branch.
 *
 * The consumer is intentionally separate from the trigger consumer: the trigger
 * consumer *starts new* workflows on these event types, whereas this one
 * *resumes existing* paused executions. Both can react to the same event.
 *
 * Guards:
 *   - Runs in its own consumer group so it never steals the trigger consumer's
 *     offsets.
 *   - Every handler is wrapped in try/catch; a failure to correlate or resume
 *     is logged and swallowed so the Kafka run loop is never crashed.
 *   - Resume itself is idempotent (see executor.resumeFromApproval): a duplicate
 *     or replayed event finds the execution already RUNNING and no-ops.
 *   - If no matching PAUSED execution is found, the event is ignored quietly.
 */
export async function startApprovalConsumer(
  prisma: WorkflowPrisma,
  producer: NexusProducer,
  logger?: { warn: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void }
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('workflow-service.approvals');
  const executions = createExecutionsService(prisma, producer);

  const handle = (outcome: 'approved' | 'rejected') =>
    async (event: { tenantId: string; payload: Record<string, unknown> }) => {
      try {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const executionId = await executions.findPausedExecutionForApproval(
          event.tenantId,
          payload
        );
        if (!executionId) {
          // Not a workflow-driven approval, or already resumed — ignore quietly.
          return;
        }
        const resumed = await executions.resumeFromApproval(executionId, outcome);
        logger?.info?.({ executionId, outcome, resumed }, 'Approval resume processed');
      } catch (err) {
        logger?.warn({ err, outcome }, 'Approval resume handler failed');
      }
    };

  consumer.on('approval.request.approved', handle('approved'));
  consumer.on('approval.request.rejected', handle('rejected'));

  await consumer.subscribe([TOPICS.WORKFLOWS]);
  await consumer.start();
  return consumer;
}
