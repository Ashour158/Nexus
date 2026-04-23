import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';

export async function handleSetFieldNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    service?: 'CRM' | 'FINANCE';
    entity?: string;
    idField?: string;
    field?: string;
    value?: unknown;
  };
  const base =
    cfg.service === 'FINANCE'
      ? process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002/api/v1'
      : process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1';
  const id = String(context.triggerPayload[cfg.idField ?? 'id'] ?? '');
  if (!id || !cfg.entity || !cfg.field) return { output: { skipped: true } };
  return handleActionNode(
    {
      ...node,
      config: {
        url: `${base}/${cfg.entity}/${id}`,
        method: 'PATCH',
        body: { [cfg.field]: cfg.value },
      },
    },
    context
  );
}
