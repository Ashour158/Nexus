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
  | 'END';

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
}

export interface NodeResult {
  nextNodeId?: string | null;
  pauseUntil?: Date | null;
  output?: Record<string, unknown>;
}
