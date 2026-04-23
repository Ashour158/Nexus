import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

export async function handleForkNode(
  node: WorkflowNode,
  _context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as { branches?: string[] };
  return { output: { branches: cfg.branches ?? [] } };
}
