import { BusinessRuleError } from '@nexus/service-utils';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

const ALLOWED = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']);

function readField(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[k];
  }, payload);
}

export async function handleConditionNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    field?: string;
    operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
    value?: unknown;
    trueNodeId?: string;
    falseNodeId?: string;
  };
  const fieldValue = cfg.field ? readField(context.triggerPayload, cfg.field) : undefined;
  if (cfg.operator !== undefined && cfg.operator !== null && !ALLOWED.has(String(cfg.operator))) {
    throw new BusinessRuleError(`Unknown condition operator: ${String(cfg.operator)}`);
  }
  let matched = false;
  switch (cfg.operator) {
    case 'eq':
      matched = fieldValue === cfg.value;
      break;
    case 'neq':
      matched = fieldValue !== cfg.value;
      break;
    case 'gt':
      matched = Number(fieldValue) > Number(cfg.value);
      break;
    case 'gte':
      matched = Number(fieldValue) >= Number(cfg.value);
      break;
    case 'lt':
      matched = Number(fieldValue) < Number(cfg.value);
      break;
    case 'lte':
      matched = Number(fieldValue) <= Number(cfg.value);
      break;
    case 'contains':
      matched = String(fieldValue).includes(String(cfg.value));
      break;
    default:
      matched = false;
  }
  const nextNodeId = matched ? (cfg.trueNodeId ?? null) : (cfg.falseNodeId ?? null);
  return { nextNodeId, output: { matched, field: cfg.field, operator: cfg.operator, value: cfg.value } };
}
