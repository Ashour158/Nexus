import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * SLA_CHECK node — evaluates whether an entity (deal, lead, etc.) is within SLA.
 * Queries the SLA engine to check if the entity has breached any SLA definitions.
 *
 * Config:
 *   - entityType: string — e.g. 'deal', 'lead'
 *   - entityId: string — the record ID to check
 *   - slaId: string? — optional specific SLA definition to check against
 */
export async function handleSlaCheckNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    entityType?: string;
    entityId?: string;
    slaId?: string;
  };

  const slaServiceUrl = process.env.SLA_SERVICE_URL ?? process.env.WORKFLOW_SERVICE_URL ?? 'http://localhost:3007/api/v1';

  try {
    const url = new URL(`${slaServiceUrl}/sla/check`);
    url.searchParams.set('entityType', cfg.entityType ?? '');
    url.searchParams.set('entityId', cfg.entityId ?? '');
    if (cfg.slaId) url.searchParams.set('slaId', cfg.slaId);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
        'x-tenant-id': context.tenantId,
      },
    });

    if (!res.ok) {
      return {
        nextNodeId: undefined,
        output: {
          withinSla: true,
          warning: `SLA service unavailable (${res.status}); assuming within SLA`,
        },
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      nextNodeId: undefined,
      output: {
        withinSla: data.withinSla ?? true,
        breaches: data.breaches ?? [],
      },
    };
  } catch (err) {
    return {
      nextNodeId: undefined,
      output: {
        withinSla: true,
        warning: err instanceof Error ? err.message : 'SLA check failed; assuming within SLA',
      },
    };
  }
}
