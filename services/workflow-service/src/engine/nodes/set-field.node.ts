import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';
import { causationBody, causationHeaders } from './causation.util.js';

/** Entities the CRM internal set-field route accepts (singular). */
const INTERNAL_ENTITIES = new Set(['deal', 'lead', 'contact', 'account']);

/** Normalise a configured entity name to the singular form the route expects. */
export function normaliseEntity(raw?: string): string | null {
  if (!raw) return null;
  const e = raw.toLowerCase().replace(/s$/, '');
  return INTERNAL_ENTITIES.has(e) ? e : null;
}

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
  // The internal automation write route is CRM-only. A FINANCE set-field has no
  // authenticated internal target, so skip it cleanly rather than issue an
  // unauthenticated (and now truthfully-failing) write.
  if (cfg.service === 'FINANCE') {
    return { output: { skipped: true, reason: 'finance_set_field_unsupported' } };
  }
  const entity = normaliseEntity(cfg.entity);
  const id = String(context.triggerPayload[cfg.idField ?? 'id'] ?? '');
  if (!id || !entity || !cfg.field) {
    return { output: { skipped: true, reason: 'missing_entity_id_or_field' } };
  }
  const base = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  return handleActionNode(
    {
      ...node,
      config: {
        internal: true,
        url: `${base}/api/v1/internal/automation/set-field`,
        method: 'POST',
        headers: { 'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '', ...causationHeaders(context) },
        body: {
          tenantId: context.tenantId,
          entity,
          id,
          fields: { [cfg.field]: cfg.value },
          ...causationBody(context),
        },
      },
    },
    context
  );
}
