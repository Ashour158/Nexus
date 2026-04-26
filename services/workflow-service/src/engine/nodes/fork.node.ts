import { type NexusProducer, TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * FORK: creates one child WorkflowExecution per branch, records a
 * WorkflowForkTracker, publishes workflow.branch.start for each child,
 * then pauses the parent execution for up to 24 h pointing at the JOIN node.
 *
 * config shape: { branches: string[]; joinNodeId: string }
 *   branches   — array of node IDs that are the first node of each branch
 *   joinNodeId — the JOIN node the parent resumes at once all branches finish
 */
export async function handleForkNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<NodeResult> {
  const config = (node.config ?? {}) as { branches?: string[]; joinNodeId?: string };
  const branches = config.branches ?? [];
  const joinNodeId = config.joinNodeId;

  // Edge case: no branches configured — skip through immediately
  if (branches.length === 0) {
    return { output: { skipped: true } };
  }

  if (!joinNodeId) {
    throw new Error(`FORK node "${node.id}" is missing joinNodeId in config`);
  }

  // Record the tracker BEFORE spawning children so JOIN can always find it
  await prisma.workflowForkTracker.create({
    data: {
      executionId: context.executionId,
      forkNodeId: node.id,
      joinNodeId,
      branchNodeIds: branches,
      completedIds: [],
    },
  });

  // Spawn one child execution per branch and publish a start event for each
  for (const branchNodeId of branches) {
    const child = await prisma.workflowExecution.create({
      data: {
        tenantId: context.tenantId,
        workflowId: context.workflowId,
        triggerType: 'BRANCH',
        triggerPayload: context.triggerPayload as object,
        status: 'RUNNING',
        currentNodeId: branchNodeId,
        parentExecId: context.executionId,
        parentForkId: node.id,
      },
    });

    await producer
      .publish(TOPICS.WORKFLOWS, {
        type: 'workflow.branch.start',
        tenantId: context.tenantId,
        payload: {
          executionId: child.id,
          parentExecutionId: context.executionId,
          branchNodeId,
        },
      })
      .catch(() => undefined); // Non-fatal: child row already persisted
  }

  // Pause the parent for up to 24 h; executor will resume it at joinNodeId
  const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { nextNodeId: joinNodeId, pauseUntil };
}
