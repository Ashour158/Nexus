import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleSetFieldNode } from './set-field.node.js';

export async function handleAssignNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as { entity?: string; userId?: string };
  return handleSetFieldNode(
    {
      ...node,
      config: {
        service: 'CRM',
        entity: cfg.entity ?? 'deals',
        idField: 'dealId',
        field: 'ownerId',
        value: cfg.userId,
      },
    },
    context
  );
}
