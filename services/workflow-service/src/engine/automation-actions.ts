import type {
  ExecutionContext,
  NodeResult,
  NotificationProducer,
  WorkflowNode,
  WorkflowNodeType,
} from './types.js';
import { handleAssignNode } from './nodes/assign.node.js';
import { handleCreateActivityNode } from './nodes/create-activity.node.js';
import { handleCreateTaskNode } from './nodes/create-task.node.js';
import { handleEmailNode } from './nodes/email.node.js';
import { handleNotifyNode } from './nodes/notify.node.js';
import { handleSetFieldNode } from './nodes/set-field.node.js';
import { handleWebhookNode } from './nodes/webhook.node.js';

/**
 * Declarative automation-rule action. `type` selects one of the existing engine
 * action node handlers; `config` is passed straight through as the node config.
 */
export interface AutomationAction {
  type: string;
  config?: Record<string, unknown>;
}

/**
 * Automation action types → the engine node type that performs the side-effect.
 * Only side-effect handlers with a `(node, context)` signature are reused here
 * (no graph/branching handlers), which keeps rule execution linear + stateless.
 */
const ACTION_TO_NODE: Record<string, WorkflowNodeType> = {
  SEND_NOTIFICATION: 'NOTIFY',
  NOTIFY: 'NOTIFY',
  CREATE_TASK: 'CREATE_TASK',
  CREATE_ACTIVITY: 'CREATE_ACTIVITY',
  SEND_EMAIL: 'EMAIL',
  EMAIL: 'EMAIL',
  WEBHOOK: 'WEBHOOK',
  UPDATE_FIELD: 'SET_FIELD',
  SET_FIELD: 'SET_FIELD',
  ASSIGN: 'ASSIGN',
};

/** The action types an admin may configure (surfaced in /meta). */
export const SUPPORTED_ACTION_TYPES = Object.keys(ACTION_TO_NODE);

export function isSupportedActionType(type: string): boolean {
  return type in ACTION_TO_NODE;
}

async function dispatchNode(
  nodeType: WorkflowNodeType,
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  switch (nodeType) {
    case 'NOTIFY':
      return handleNotifyNode(node, context);
    case 'CREATE_TASK':
      return handleCreateTaskNode(node, context);
    case 'CREATE_ACTIVITY':
      return handleCreateActivityNode(node, context);
    case 'EMAIL':
      return handleEmailNode(node, context);
    case 'WEBHOOK':
      return handleWebhookNode(node, context);
    case 'SET_FIELD':
      return handleSetFieldNode(node, context);
    case 'ASSIGN':
      return handleAssignNode(node, context);
    default:
      throw new Error(`Unsupported automation action node: ${String(nodeType)}`);
  }
}

/**
 * Execute a single declarative action by delegating to the matching engine node
 * handler. Builds a synthetic node from `{type, config}`.
 */
export async function executeAutomationAction(
  action: AutomationAction,
  context: ExecutionContext,
  index: number
): Promise<NodeResult> {
  const nodeType = ACTION_TO_NODE[action.type];
  if (!nodeType) {
    throw new Error(`Unknown automation action type: ${action.type}`);
  }
  const node: WorkflowNode = {
    id: `action-${index}`,
    type: nodeType,
    config: action.config ?? {},
  };
  return dispatchNode(nodeType, node, context);
}

/**
 * Build a minimal ExecutionContext for an automation rule firing off a domain
 * event. There is no WorkflowExecution row backing a rule run, so we synthesise
 * stable ids (used only for logging / notification metadata).
 */
export function buildRuleExecutionContext(
  tenantId: string,
  ruleId: string,
  eventId: string,
  payload: Record<string, unknown>,
  producer?: NotificationProducer,
  opts?: { simulate?: boolean; causationDepth?: number; rootEventId?: string }
): ExecutionContext {
  return {
    tenantId,
    executionId: `auto:${ruleId}:${eventId}`,
    workflowId: ruleId,
    triggerPayload: payload,
    currentNodeId: null,
    producer,
    simulate: opts?.simulate ?? false,
    causationDepth: opts?.causationDepth ?? 0,
    rootEventId: opts?.rootEventId ?? eventId,
  };
}

/**
 * Simulate a single action (AU-3 dry-run). Delegates to the same node handler as
 * a live run but with `simulate: true` on the context, so the handler resolves its
 * target (URL/body/event) and returns a `{ simulated: true, ... }` plan WITHOUT
 * performing any side effect (no fetch, no publish). This is the exact code path a
 * live action takes up to the moment of the effect, which is what makes the
 * preview trustworthy.
 */
export async function simulateAutomationAction(
  action: AutomationAction,
  context: ExecutionContext,
  index: number
): Promise<NodeResult> {
  return executeAutomationAction(action, { ...context, simulate: true }, index);
}
