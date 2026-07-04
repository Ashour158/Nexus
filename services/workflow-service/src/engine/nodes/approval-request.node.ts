import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * APPROVAL_REQUEST node — creates an approval request via the approval-service.
 * The workflow execution is paused until the approval is approved or rejected.
 *
 * Contract (verified against approval-service requests.routes.ts CreateSchema and
 * the working caller in finance-service/src/lib/discount-approval.ts):
 *   POST ${APPROVAL_SERVICE_URL}/api/v1/approval/requests
 *   body: { module, recordId, requestedBy?, policyId?, data }
 *
 * Config:
 *   - policyId: string — optional explicit approval policy (else matched by module/data)
 *   - entityType: string — mapped to `module` (e.g. 'quote', 'deal', 'contract')
 *   - entityId: string — mapped to `recordId` (the record to request approval for)
 *   - requesterId: string — mapped to `requestedBy` (who is requesting approval)
 *   - notes: string — optional context, carried inside `data`
 *
 * Resume correlation:
 *   `workflowExecutionId` is echoed inside `data`. approval-service persists that
 *   `data` blob and re-emits it on the approval.request.approved/rejected events,
 *   so the approval consumer's `findPausedExecutionForApproval` can read
 *   `payload.data.workflowExecutionId` and resume this exact paused execution.
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

  // Base URL of approval-service (no path suffix); default matches the fleet port.
  // Strip a trailing `/api/v1` (and any trailing slash) so we can append the full
  // route path unambiguously, matching how finance-service calls it.
  const rawBase = process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3016';
  const base = rawBase.replace(/\/+$/, '').replace(/\/api\/v1$/, '');

  const payload: {
    module: string;
    recordId: string;
    requestedBy?: string;
    policyId?: string;
    data: Record<string, unknown>;
  } = {
    module: cfg.entityType ?? 'workflow',
    recordId: cfg.entityId ?? context.workflowId,
    data: {
      // Correlation key the resume path relies on — MUST be echoed back on the event.
      workflowExecutionId: context.executionId,
      workflowId: context.workflowId,
      entityType: cfg.entityType,
      entityId: cfg.entityId,
      notes: cfg.notes,
      reason: 'WORKFLOW_APPROVAL',
    },
  };
  if (cfg.requesterId) payload.requestedBy = cfg.requesterId;
  if (cfg.policyId) payload.policyId = cfg.policyId;

  try {
    const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
    const res = await fetch(`${base}/api/v1/approval/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': context.tenantId,
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`Approval service returned ${res.status}: ${text}`);
    }

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { id?: string };
    };
    const approvalRequestId = json.data?.id;

    // Pause execution — will be resumed by Kafka event from approval-service.
    const pauseUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days max

    return {
      nextNodeId: null,
      pauseUntil,
      output: {
        // Persisted on the step so findPausedExecutionForApproval can also
        // correlate by approvalRequestId as a fallback to workflowExecutionId.
        approvalRequestId,
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
