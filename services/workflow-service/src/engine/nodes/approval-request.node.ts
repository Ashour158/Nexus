import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * APPROVAL_REQUEST node — creates an approval request via the approval-service.
 * The workflow execution is paused until the approval is approved or rejected.
 *
 * Config:
 *   - policyId: string — the approval policy to use
 *   - entityType: string — e.g. 'quote', 'deal', 'contract'
 *   - entityId: string — the record to request approval for
 *   - requesterId: string — who is requesting approval
 *   - notes: string — optional context
 */
export async function handleApprovalRequestNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    policyId?: string;
    entityType?: string;
    entityId?: string;
    requesterId?: string;
    notes?: string;
  };

  const approvalServiceUrl = process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3016/api/v1';

  const payload = {
    policyId: cfg.policyId,
    entityType: cfg.entityType,
    entityId: cfg.entityId,
    requesterId: cfg.requesterId,
    notes: cfg.notes,
    tenantId: context.tenantId,
    workflowExecutionId: context.executionId,
  };

  try {
    const res = await fetch(`${approvalServiceUrl}/approval-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`Approval service returned ${res.status}: ${text}`);
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    // Pause execution — will be resumed by Kafka event from approval-service
    const pauseUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days max

    return {
      nextNodeId: null,
      pauseUntil,
      output: {
        approvalRequestId: data.id,
        status: 'PENDING',
        message: 'Approval request created; workflow paused pending response',
      },
    };
  } catch (err) {
    return {
      nextNodeId: null,
      output: {
        error: err instanceof Error ? err.message : String(err),
        status: 'FAILED',
      },
    };
  }
}
