import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleCreateActivityNode } from './create-activity.node.js';

export async function handleCreateTaskNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  return handleCreateActivityNode(
    {
      ...node,
      config: {
        ...(node.config ?? {}),
        type: 'TASK',
      },
    },
    context
  );
}
