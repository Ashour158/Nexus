import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

export async function handleJoinNode(
  _node: WorkflowNode,
  _context: ExecutionContext
): Promise<NodeResult> {
  return { output: { joined: true } };
}
