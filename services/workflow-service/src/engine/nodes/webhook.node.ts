import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';

export async function handleWebhookNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  return handleActionNode(node, context);
}
