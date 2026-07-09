import type { ExecutionContext, NodeResult, WorkflowEdge, WorkflowNode } from '../types.js';

/**
 * SLA_CHECK node — evaluates whether an entity (deal, lead, etc.) is within SLA.
 * Queries the SLA engine to check if the entity has breached any SLA definitions.
 *
 * Config:
 *   - entityType: string — e.g. 'deal', 'lead'
 *   - entityId: string — the record ID to check
 *   - slaId: string? — optional specific SLA definition to check against
 *
 * Branching:
 *   After computing `withinSla`, the node routes down an outgoing edge whose
 *   `condition` label matches the result:
 *     - within SLA   → edge labelled 'within' | 'ok' | 'true' | 'pass'
 *     - breached SLA → edge labelled 'breached' | 'breach' | 'false' | 'fail'
 *   When the workflow does not model branches (no matching labelled edge),
 *   `nextNodeId` is left `undefined` so the executor follows the default
 *   unconditional edge — preserving the previous linear behaviour.
 *   Fail-open: on any error we assume within-SLA and select the safe edge.
 */
function selectSlaEdge(
  nodeId: string,
  edges: WorkflowEdge[],
  withinSla: boolean
): string | undefined {
  const outgoing = edges.filter((e) => e.from === nodeId);
  if (outgoing.length === 0) return undefined;
  const wantLabels = withinSla
    ? ['within', 'ok', 'true', 'pass', 'yes']
    : ['breached', 'breach', 'false', 'fail', 'no'];
  const labelled = outgoing.find(
    (e) => typeof e.condition === 'string' && wantLabels.includes(e.condition.trim().toLowerCase())
  );
  // Only override the default flow when the workflow actually models this branch.
  return labelled?.to ?? undefined;
}

export async function handleSlaCheckNode(
  node: WorkflowNode,
  context: ExecutionContext,
  edges: WorkflowEdge[] = []
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
      // Fail-open: assume within SLA and take the safe edge.
      return {
        nextNodeId: selectSlaEdge(node.id, edges, true),
        output: {
          withinSla: true,
          warning: `SLA service unavailable (${res.status}); assuming within SLA`,
        },
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const withinSla = data.withinSla !== false; // default true unless explicitly false
    return {
      nextNodeId: selectSlaEdge(node.id, edges, withinSla),
      output: {
        withinSla,
        breaches: data.breaches ?? [],
      },
    };
  } catch (err) {
    // Fail-open on network errors: assume within SLA, take the safe edge.
    return {
      nextNodeId: selectSlaEdge(node.id, edges, true),
      output: {
        withinSla: true,
        warning: err instanceof Error ? err.message : 'SLA check failed; assuming within SLA',
      },
    };
  }
}
