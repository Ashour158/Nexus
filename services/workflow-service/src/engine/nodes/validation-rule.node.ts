import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * VALIDATION_RULE node — calls blueprint-service to validate a stage transition
 * or other business rule. If validation fails, the node returns an error output.
 *
 * Config:
 *   - pipelineId: string
 *   - fromStageId: string
 *   - toStageId: string
 *   - dealId: string
 */
export async function handleValidationRuleNode(
  node: WorkflowNode,
  context: ExecutionContext
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
          nextNodeId: undefined,
          output: {
            valid: true,
            warning: `Blueprint service unavailable (${res.status}); allowing transition`,
          },
        };
      }
      return {
        nextNodeId: undefined,
        output: {
          valid: false,
          error: text,
        },
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      nextNodeId: undefined,
      output: {
        valid: true,
        data,
      },
    };
  } catch (err) {
    // Fail-open on network errors
    return {
      nextNodeId: undefined,
      output: {
        valid: true,
        warning: err instanceof Error ? err.message : 'Blueprint validation failed; allowing transition',
      },
    };
  }
}
