export type WorkflowNodeType =
  | 'TRIGGER'
  | 'CONDITION'
  | 'WAIT'
  | 'ACTION'
  | 'EMAIL'
  | 'WEBHOOK'
  | 'SET_FIELD'
  | 'CREATE_ACTIVITY'
  | 'CREATE_TASK'
  | 'ASSIGN'
  | 'NOTIFY'
  | 'FORK'
  | 'JOIN'
  | 'END'
  | 'APPROVAL_REQUEST'
  | 'VALIDATION_RULE'
  | 'SLA_CHECK';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface ExecutionContext {
  tenantId: string;
  executionId: string;
  workflowId: string;
  triggerPayload: Record<string, unknown>;
  currentNodeId?: string | null;
  /**
   * Kafka producer used by side-effect nodes that deliver via an event rather
   * than an HTTP call (NOTIFY / EMAIL publish `notification.requested`). Optional
   * so contexts that never reach those nodes need not supply one.
   */
  producer?: NotificationProducer;
  /**
   * Dry-run flag (AU-3). When true, side-effect nodes resolve their target
   * URL/body/event but MUST NOT perform the effect (no fetch, no publish) — they
   * return `{ simulated: true, ... }` describing what they *would* do. Used by the
   * automation-rule `/test` endpoint to validate a rule against a sample payload.
   */
  simulate?: boolean;
  /**
   * Cause-chain depth (AU-5 loop guard). 0 for a user-originated domain event;
   * incremented each time an automation-caused mutation re-enters the engine.
   * Side-effect nodes that write back to CRM forward `causationDepth + 1` (and
   * `rootEventId`) so the emitted domain event carries the running depth and the
   * consumer can refuse to execute past `AUTOMATION_MAX_CAUSATION_DEPTH`.
   */
  causationDepth?: number;
  /** Original (root) event id that started this cause chain (AU-5). */
  rootEventId?: string;
}

/** Minimal producer surface the notify/email nodes need (a NexusProducer). */
export interface NotificationProducer {
  publish(
    topic: string,
    event: { type: string; tenantId: string; payload?: unknown; [key: string]: unknown }
  ): Promise<void>;
}

export interface NodeResult {
  /**
   * nextNodeId:
   *   - undefined → executor follows outgoing graph edges (normal flow)
   *   - null      → explicit workflow termination (stops the execution)
   *   - string    → jump directly to this specific node ID
   */
  nextNodeId?: string | null;
  pauseUntil?: Date | null;
  output?: Record<string, unknown>;
}
