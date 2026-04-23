import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

export async function handleEndNode(
  _node: WorkflowNode,
  _context: ExecutionContext
): Promise<NodeResult> {
  return { nextNodeId: null, output: { ended: true } };
}
