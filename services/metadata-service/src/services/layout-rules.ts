/**
 * Pure, dependency-free Layout-Rule evaluator (Zoho "Layout Rules").
 *
 * A LayoutRule fires when the trigger field of the live record satisfies the
 * rule's operator/value, and then applies its ordered `actions` to the running
 * set of UI directives. The evaluator is deterministic and total: it never
 * throws and never performs IO, so it is safe to reuse from routes, GraphQL, or
 * a future in-process guard.
 *
 * HARD CONTRACT — FAIL-OPEN:
 *   - An unknown operator => the rule does NOT fire (no directives applied).
 *   - A malformed action / unknown action type is skipped.
 *   - Any internal error while evaluating one rule is swallowed and treated as
 *     "did not fire", so one bad rule can never poison the batch.
 *
 * Default state (no rule fires) is today's behavior: nothing hidden, nothing
 * extra required, nothing forced read-only.
 */

/** Operators understood by a layout rule's trigger. */
export const LAYOUT_RULE_OPERATORS = [
  'eq',
  'ne',
  'in',
  'gt',
  'lt',
  'is_empty',
  'is_not_empty',
] as const;

export type LayoutRuleOperator = (typeof LAYOUT_RULE_OPERATORS)[number];

const OPERATOR_SET = new Set<string>(LAYOUT_RULE_OPERATORS);

/** Action types a layout rule may apply. */
export const LAYOUT_ACTION_TYPES = [
  'SHOW_FIELD',
  'HIDE_FIELD',
  'SHOW_SECTION',
  'HIDE_SECTION',
  'REQUIRE_FIELD',
  'SET_READONLY',
] as const;

export type LayoutActionType = (typeof LAYOUT_ACTION_TYPES)[number];

const ACTION_TYPE_SET = new Set<string>(LAYOUT_ACTION_TYPES);

export interface LayoutAction {
  type: string;
  target: string;
}

/** Minimal shape needed to evaluate a rule (matches the LayoutRule row). */
export interface EvaluableLayoutRule {
  triggerField: string;
  operator: string;
  triggerValue?: unknown;
  actions: unknown;
  isActive?: boolean;
  position?: number | null;
}

export interface LayoutDirectives {
  hiddenFields: string[];
  hiddenSections: string[];
  requiredFields: string[];
  readonlyFields: string[];
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return Number.NaN;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/**
 * Single operator function reused across every operator. Returns whether the
 * record's actual value satisfies `operator` against `expected`. Unknown
 * operators return false (rule does not fire).
 */
export function applyOperator(operator: string, actual: unknown, expected: unknown): boolean {
  if (!OPERATOR_SET.has(operator)) return false;
  try {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'in':
        return Array.isArray(expected) ? expected.includes(actual) : false;
      case 'gt':
        return toNumber(actual) > toNumber(expected);
      case 'lt':
        return toNumber(actual) < toNumber(expected);
      case 'is_empty':
        return isEmpty(actual);
      case 'is_not_empty':
        return !isEmpty(actual);
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function normalizeActions(actions: unknown): LayoutAction[] {
  if (!Array.isArray(actions)) return [];
  const out: LayoutAction[] = [];
  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    const type = (a as Record<string, unknown>).type;
    const target = (a as Record<string, unknown>).target;
    if (typeof type === 'string' && ACTION_TYPE_SET.has(type) && typeof target === 'string' && target.length > 0) {
      out.push({ type, target });
    }
  }
  return out;
}

function applyAction(action: LayoutAction, sets: {
  hiddenFields: Set<string>;
  hiddenSections: Set<string>;
  requiredFields: Set<string>;
  readonlyFields: Set<string>;
}): void {
  switch (action.type) {
    case 'HIDE_FIELD':
      sets.hiddenFields.add(action.target);
      break;
    case 'SHOW_FIELD':
      // Explicit show overrides a prior hide (fields are visible by default).
      sets.hiddenFields.delete(action.target);
      break;
    case 'HIDE_SECTION':
      sets.hiddenSections.add(action.target);
      break;
    case 'SHOW_SECTION':
      sets.hiddenSections.delete(action.target);
      break;
    case 'REQUIRE_FIELD':
      sets.requiredFields.add(action.target);
      break;
    case 'SET_READONLY':
      sets.readonlyFields.add(action.target);
      break;
    default:
      break;
  }
}

/**
 * Evaluate every active rule (in order) against `record` and return the
 * resolved UI directives. Rules are applied in the given order; later actions
 * win over earlier ones for the same target (e.g. a SHOW after a HIDE).
 */
export function evaluateLayoutRules(
  rules: EvaluableLayoutRule[],
  record: Record<string, unknown>
): LayoutDirectives {
  const safeRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const sets = {
    hiddenFields: new Set<string>(),
    hiddenSections: new Set<string>(),
    requiredFields: new Set<string>(),
    readonlyFields: new Set<string>(),
  };

  const ordered = [...rules]
    .filter((r) => r && r.isActive !== false)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  for (const rule of ordered) {
    let fired = false;
    try {
      const actual = safeRecord[rule.triggerField];
      fired = applyOperator(rule.operator, actual, rule.triggerValue);
    } catch {
      fired = false; // fail-open
    }
    if (!fired) continue;
    for (const action of normalizeActions(rule.actions)) {
      applyAction(action, sets);
    }
  }

  return {
    hiddenFields: [...sets.hiddenFields],
    hiddenSections: [...sets.hiddenSections],
    requiredFields: [...sets.requiredFields],
    readonlyFields: [...sets.readonlyFields],
  };
}
