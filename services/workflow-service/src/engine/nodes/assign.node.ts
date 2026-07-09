import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';
import { normaliseEntity } from './set-field.node.js';

export async function handleAssignNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    entity?: string;
    idField?: string;
    userId?: string;
    ownerIdField?: string;
  };
  const entity = normaliseEntity(cfg.entity ?? 'deal');
  if (!entity) return { output: { skipped: true, reason: 'unsupported_entity' } };
  const id = String(context.triggerPayload[cfg.idField ?? `${entity}Id`] ?? '');
  // ownerId may be a literal (config.userId) or resolved from the event payload.
  const ownerId = cfg.userId ?? String(context.triggerPayload[cfg.ownerIdField ?? 'ownerId'] ?? '');
  if (!id || !ownerId) return { output: { skipped: true, reason: 'missing_id_or_owner' } };
  const base = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  return handleActionNode(
    {
      ...node,
      config: {
        url: `${base}/api/v1/internal/automation/assign`,
        method: 'POST',
        headers: { 'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
        body: {
          tenantId: context.tenantId,
          entity,
          id,
          ownerId,
        },
      },
    },
    context
  );
}
