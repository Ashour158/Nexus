import type { ExecutionContext, NodeResult, WorkflowEdge, WorkflowNode } from '../types.js';

/**
 * VALIDATION_RULE node — calls blueprint-service to validate a stage transition
 * or other business rule. If validation fails, the node returns an error output.
 *
 * Config:
 *   - pipelineId: string
 *   - fromStageId: string
 *   - toStageId: string
 *   - dealId: string
 *
 * Branching:
 *   After computing `valid`, the node routes down an outgoing edge whose
 *   `condition` label matches the result:
 *     - valid   → edge labelled 'valid' | 'true' | 'pass' | 'yes'
 *     - invalid → edge labelled 'invalid' | 'false' | 'fail' | 'no'
 *   When the workflow does not model branches (no matching labelled edge),
 *   `nextNodeId` is left `undefined` so the executor follows the default
 *   unconditional edge — preserving the previous linear behaviour.
 *   Fail-open: on service/network errors we treat the transition as valid and
 *   select the safe edge.
 */
function selectValidationEdge(
  nodeId: string,
  edges: WorkflowEdge[],
  valid: boolean
): string | undefined {
  const outgoing = edges.filter((e) => e.from === nodeId);
  if (outgoing.length === 0) return undefined;
  const wantLabels = valid
    ? ['valid', 'true', 'pass', 'yes', 'ok']
    : ['invalid', 'false', 'fail', 'no'];
  const labelled = outgoing.find(
    (e) => typeof e.condition === 'string' && wantLabels.includes(e.condition.trim().toLowerCase())
  );
  // Only override the default flow when the workflow actually models this branch.
  return labelled?.to ?? undefined;
}

export async function handleValidationRuleNode(
  node: WorkflowNode,
  context: ExecutionContext,
  edges: WorkflowEdge[] = []
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    pipelineId?: string;
    fromStageId?: string;
    toStageId?: string;
    dealId?: string;
  };

  const blueprintServiceUrl = process.env.BLUEPRINT_SERVICE_URL ?? 'http://localhost:3013/api/v1';

  const payload = {
    pipelineId: cfg.pipelineId,
    fromStageId: cfg.fromStageId,
    toStageId: cfg.toStageId,
    dealId: cfg.dealId,
    tenantId: context.tenantId,
  };

  try {
    const res = await fetch(`${blueprintServiceUrl}/blueprints/internal/validate-transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-blueprint-service-token': process.env.BLUEPRINT_SERVICE_TOKEN ?? '',
        'x-tenant-id': context.tenantId,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      // Fail-open: if blueprint service is unavailable, allow the transition
      if (res.status >= 500) {
        return {
          nextNodeId: selectValidationEdge(node.id, edges, true),
          output: {
            valid: true,
            warning: `Blueprint service unavailable (${res.status}); allowing transition`,
          },
        };
      }
      // A 4xx means the transition is genuinely invalid → take the invalid edge.
      return {
        nextNodeId: selectValidationEdge(node.id, edges, false),
        output: {
          valid: false,
          error: text,
        },
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Respect an explicit `valid: false` from the service; default to valid.
    const valid = data.valid !== false;
    return {
      nextNodeId: selectValidationEdge(node.id, edges, valid),
      output: {
        valid,
        data,
      },
    };
  } catch (err) {
    // Fail-open on network errors
    return {
      nextNodeId: selectValidationEdge(node.id, edges, true),
      output: {
        valid: true,
        warning: err instanceof Error ? err.message : 'Blueprint validation failed; allowing transition',
      },
    };
  }
}
