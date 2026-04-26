import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * JOIN: checks whether all branch children of the matching FORK have
 * completed. If not, re-pauses for 60 seconds (polling). Once all branches
 * are COMPLETED the JOIN returns normally and execution continues.
 *
 * The executor nudges the parent resumeAt to new Date(0) whenever a child
 * execution completes (see executor.ts → parentExecId handling), so in
 * practice the JOIN wakes up almost immediately after the last branch ends.
 */
export async function handleJoinNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma
): Promise<NodeResult> {
  // Find the tracker created by the most-recent FORK that targets this JOIN
  const tracker = await prisma.workflowForkTracker.findFirst({
    where: {
      executionId: context.executionId,
      joinNodeId: node.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  // No tracker → reached without a FORK (misconfigured graph) — skip through
  if (!tracker) {
    return { output: { skipped: true } };
  }

  // Count how many children have finished
  const completedCount = await prisma.workflowExecution.count({
    where: {
      parentExecId: context.executionId,
      parentForkId: tracker.forkNodeId,
      status: 'COMPLETED',
    },
  });

  const totalBranches = tracker.branchNodeIds.length;

  if (completedCount < totalBranches) {
    // Not all done yet — re-pause for 60 s so the executor polls again
    const pauseUntil = new Date(Date.now() + 60 * 1000);
    return { pauseUntil, nextNodeId: node.id };
  }

  // All branches completed — pass through to the next node
  return { output: { completedBranches: completedCount } };
}
