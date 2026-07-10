import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';
import { causationBody, causationHeaders } from './causation.util.js';

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
  // CRM_SERVICE_URL in compose is the bare origin (http://crm-service:3001) — the
  // internal automation write route lives under /api/v1/internal/automation.
  const base = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  const ownerId = String(context.triggerPayload[cfg.ownerIdField ?? 'ownerId'] ?? '');
  const dealId = String(context.triggerPayload[cfg.dealIdField ?? 'dealId'] ?? '');
  return handleActionNode(
    {
      ...node,
      config: {
        url: `${base}/api/v1/internal/automation/activities`,
        method: 'POST',
        headers: { 'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '', ...causationHeaders(context) },
        body: {
          tenantId: context.tenantId,
          type: cfg.type ?? 'TASK',
          subject: cfg.subject ?? 'Workflow follow-up',
          ownerId,
          dealId: dealId || undefined,
          dueDate: new Date(Date.now() + (cfg.dueInHours ?? 24) * 60 * 60 * 1000).toISOString(),
          ...causationBody(context),
        },
      },
    },
    context
  );
}
