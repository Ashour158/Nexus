import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';

export async function handleCreateActivityNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    type?: string;
    subject?: string;
    ownerIdField?: string;
    dealIdField?: string;
    dueInHours?: number;
  };
  const base = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1';
  const ownerId = String(context.triggerPayload[cfg.ownerIdField ?? 'ownerId'] ?? '');
  const dealId = String(context.triggerPayload[cfg.dealIdField ?? 'dealId'] ?? '');
  return handleActionNode(
    {
      ...node,
      config: {
        url: `${base}/activities`,
        method: 'POST',
        body: {
          type: cfg.type ?? 'TASK',
          subject: cfg.subject ?? 'Workflow follow-up',
          ownerId,
          dealId: dealId || undefined,
          dueDate: new Date(Date.now() + (cfg.dueInHours ?? 24) * 60 * 60 * 1000).toISOString(),
          customFields: { source: 'workflow' },
        },
      },
    },
    context
  );
}
