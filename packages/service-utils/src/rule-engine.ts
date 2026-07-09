export type RuleSeverity = 'info' | 'warning' | 'error';

export type RuleOperation =
  | 'exists'
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn'
  | 'min'
  | 'max'
  | 'changed'
  | 'transitionAllowed';

export interface RuleCondition<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  field: keyof TRecord | string;
  op: RuleOperation;
  value?: unknown;
  from?: unknown[];
  to?: unknown[];
}

export interface BusinessRule<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  module: string;
  type:
    | 'validation'
    | 'transition'
    | 'routing'
    | 'dedupe'
    | 'archive'
    | 'approval'
    | 'sla'
    | 'automation';
  name: string;
  enabled: boolean;
  severity: RuleSeverity;
  message: string;
  conditions: RuleCondition<TRecord>[];
  actions?: Array<{
    type: 'assign' | 'approve' | 'trigger' | 'archive' | 'webhook' | 'audit';
    payload?: Record<string, unknown>;
  }>;
}

export interface RuleEvaluationInput<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  module: string;
  record: TRecord;
  previousRecord?: Partial<TRecord> | null;
  transition?: { field: keyof TRecord | string; from: unknown; to: unknown };
  context?: {
    tenantId?: string;
    actorId?: string;
    roleIds?: string[];
    now?: Date;
  };
}

export interface RuleViolation {
  ruleId: string;
  module: string;
  type: BusinessRule['type'];
  severity: RuleSeverity;
  message: string;
  field?: string;
}

export interface RuleEvaluationResult {
  valid: boolean;
  violations: RuleViolation[];
  actions: NonNullable<BusinessRule['actions']>;
}

export function evaluateBusinessRules<TRecord extends Record<string, unknown>>(
  rules: BusinessRule<TRecord>[],
  input: RuleEvaluationInput<TRecord>
): RuleEvaluationResult {
  const violations: RuleViolation[] = [];
  const actions: NonNullable<BusinessRule['actions']> = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.module !== input.module) continue;
    const passed = rule.conditions.every((condition) => evaluateCondition(condition, input));
    if (passed) {
      if (rule.actions?.length) actions.push(...rule.actions);
      continue;
    }
    violations.push({
      ruleId: rule.id,
      module: rule.module,
      type: rule.type,
      severity: rule.severity,
      message: rule.message,
      field: String(rule.conditions[0]?.field ?? ''),
    });
  }

  return {
    valid: violations.every((violation) => violation.severity !== 'error'),
    violations,
    actions,
  };
}

function evaluateCondition<TRecord extends Record<string, unknown>>(
  condition: RuleCondition<TRecord>,
  input: RuleEvaluationInput<TRecord>
) {
  const field = String(condition.field);
  const current = readPath(input.record, field);
  const previous = input.previousRecord ? readPath(input.previousRecord, field) : undefined;

  switch (condition.op) {
    case 'exists':
      return current !== undefined && current !== null && current !== '';
    case 'equals':
      return current === condition.value;
    case 'notEquals':
      return current !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(current);
    case 'notIn':
      return Array.isArray(condition.value) && !condition.value.includes(current);
    case 'min':
      return Number(current) >= Number(condition.value);
    case 'max':
      return Number(current) <= Number(condition.value);
    case 'changed':
      return current !== previous;
    case 'transitionAllowed':
      if (!input.transition || input.transition.field !== condition.field) return true;
      return Boolean(
        condition.from?.includes(input.transition.from) &&
          condition.to?.includes(input.transition.to)
      );
    default:
      return true;
  }
}

function readPath(source: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, source);
}
