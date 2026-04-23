import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

export async function handleTriggerNode(
  _node: WorkflowNode,
  _context: ExecutionContext
): Promise<NodeResult> {
  return { output: { started: true } };
}
