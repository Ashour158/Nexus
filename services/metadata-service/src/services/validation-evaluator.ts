/**
 * Pure, dependency-free validation-rule evaluator for metadata-service.
 *
 * A ValidationRule row has two JSON columns:
 *   - `condition`   — WHEN does this rule apply? (a predicate over the record)
 *   - `requirement` — WHAT must hold when the condition matches?
 *
 * A rule is VIOLATED when its condition matches AND its requirement is NOT
 * satisfied. The evaluator is intentionally tolerant of TWO authoring dialects
 * that already exist in this codebase so rules author-ed by either producer
 * evaluate identically:
 *
 *   1. metadata-service dialect
 *      condition:   { field, op, value } | { and:[...] } | { or:[...] } | { not:{...} }
 *      requirement: { requiredFields: string[] } | { field }
 *
 *   2. crm-service dialect (services/crm-service/src/lib/validation-rules.ts)
 *      condition:   { field, operator, value }         (operator: eq|neq|isNull|isNotNull|in|...)
 *      requirement: { field, rule }                    (rule: 'required' | {min,max} | {pattern})
 *
 * HARD CONTRACT — FAIL-OPEN / NON-BLOCKING:
 *   - Unknown or malformed operators are treated as NON-matching conditions
 *     (rule does not fire) — they NEVER throw and NEVER block a save.
 *   - Unknown requirement shapes are treated as SATISFIED (no violation).
 *   - Any thrown error inside a single predicate is swallowed and treated as
 *     "condition did not match", so one bad rule can never poison the batch.
 *
 * This module has NO side effects and imports nothing — safe to unit test and
 * reuse from routes, GraphQL, or a future in-process guard.
 */

export type EvaluatorRule = {
  id: string;
  name: string;
  errorMessage: string;
  condition: unknown;
  requirement: unknown;
};

export type RuleViolation = {
  ruleId: string;
  ruleName: string;
  errorMessage: string;
};

export type ValidationOutcome = {
  valid: boolean;
  rulesEvaluated: number;
  violations: RuleViolation[];
  /** Flat list of violated error messages — matches crm-service's validateRecord() shape. */
  errors: string[];
};

/** Operators understood by the evaluator. Anything else => condition does not match. */
export const SUPPORTED_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'contains',
  'startsWith',
  'endsWith',
  'matches',
  'exists',
  'isNull',
  'isNotNull',
] as const;

const OPERATOR_SET = new Set<string>(SUPPORTED_OPERATORS);

function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return Number.NaN;
}

/**
 * Evaluate a single leaf comparison. Returns false (does NOT match) for any
 * unknown operator or on any internal error — never throws.
 */
function evalLeaf(field: string, op: string, value: unknown, payload: Record<string, unknown>): boolean {
  if (!OPERATOR_SET.has(op)) return false; // unknown operator => non-blocking
  const actual = getPath(payload, field);
  try {
    switch (op) {
      case 'eq':
        return actual === value;
      case 'neq':
        return actual !== value;
      case 'gt':
        return toNumber(actual) > toNumber(value);
      case 'gte':
        return toNumber(actual) >= toNumber(value);
      case 'lt':
        return toNumber(actual) < toNumber(value);
      case 'lte':
        return toNumber(actual) <= toNumber(value);
      case 'in':
        return Array.isArray(value) ? value.includes(actual) : false;
      case 'nin':
        return Array.isArray(value) ? !value.includes(actual) : true;
      case 'contains':
        return typeof actual === 'string' && typeof value === 'string'
          ? actual.toLowerCase().includes(value.toLowerCase())
          : false;
      case 'startsWith':
        return typeof actual === 'string' && typeof value === 'string' ? actual.startsWith(value) : false;
      case 'endsWith':
        return typeof actual === 'string' && typeof value === 'string' ? actual.endsWith(value) : false;
      case 'matches':
        return typeof value === 'string' ? new RegExp(value).test(String(actual ?? '')) : false;
      case 'exists':
        // exists:true => actual present; exists:false => actual absent.
        return value === false ? isEmpty(actual) : !isEmpty(actual);
      case 'isNull':
        return isEmpty(actual);
      case 'isNotNull':
        return !isEmpty(actual);
      default:
        return false;
    }
  } catch {
    return false; // never blocks
  }
}

/**
 * Evaluate a condition tree. Supports boolean composition (and/or/not) plus a
 * leaf shape that accepts EITHER `op` (metadata dialect) or `operator` (crm
 * dialect). A missing/empty condition means "always applies".
 */
export function evaluateCondition(cond: unknown, payload: Record<string, unknown>): boolean {
  try {
    if (cond == null) return true;
    if (typeof cond !== 'object') return true;
    const c = cond as Record<string, unknown>;

    // Empty object => always applies (rule has no gating condition).
    if (Object.keys(c).length === 0) return true;

    if (Array.isArray(c.and)) return c.and.every((x) => evaluateCondition(x, payload));
    if (Array.isArray(c.or)) return c.or.some((x) => evaluateCondition(x, payload));
    if (c.not != null && typeof c.not === 'object') return !evaluateCondition(c.not, payload);

    const field = typeof c.field === 'string' ? c.field : undefined;
    // Accept both `op` (metadata) and `operator` (crm).
    const rawOp = typeof c.op === 'string' ? c.op : typeof c.operator === 'string' ? c.operator : undefined;
    if (!field || !rawOp) return true; // malformed leaf => non-gating (applies)
    return evalLeaf(field, rawOp, c.value, payload);
  } catch {
    // A broken condition must not fire the rule (fail-open).
    return false;
  }
}

/**
 * Evaluate whether a requirement is satisfied. Supports:
 *   - { requiredFields: string[] }         (all listed fields must be non-empty)
 *   - { field }                            (single field must be non-empty)
 *   - { field, rule: 'required' }          (crm dialect)
 *   - { field, rule: { min?, max? } }      (numeric range)
 *   - { field, rule: { pattern } }         (regex match)
 * Unknown shapes => satisfied (no violation).
 */
export function evaluateRequirement(req: unknown, payload: Record<string, unknown>): boolean {
  try {
    if (req == null || typeof req !== 'object') return true;
    const r = req as Record<string, unknown>;

    if (Array.isArray(r.requiredFields)) {
      return r.requiredFields.every((f) => (typeof f === 'string' ? !isEmpty(getPath(payload, f)) : true));
    }

    const field = typeof r.field === 'string' ? r.field : undefined;
    if (!field) return true; // nothing to require

    const actual = getPath(payload, field);
    const rule = r.rule;

    // { field } with no rule, or rule === 'required' => presence check.
    if (rule === undefined || rule === 'required') {
      return !isEmpty(actual);
    }

    if (rule && typeof rule === 'object') {
      const ro = rule as Record<string, unknown>;
      if ('pattern' in ro && typeof ro.pattern === 'string') {
        return new RegExp(ro.pattern).test(String(actual ?? ''));
      }
      if ('min' in ro || 'max' in ro) {
        const num = toNumber(actual);
        if (Number.isNaN(num)) return false;
        if (typeof ro.min === 'number' && num < ro.min) return false;
        if (typeof ro.max === 'number' && num > ro.max) return false;
        return true;
      }
    }

    // Unknown requirement shape => satisfied (non-blocking).
    return true;
  } catch {
    // A broken requirement must not manufacture a violation (fail-open).
    return true;
  }
}

/**
 * Evaluate a set of rules against a record payload. Pure and total: never
 * throws. A rule is a violation iff its condition matches and its requirement
 * is not satisfied.
 */
export function evaluateRules(rules: EvaluatorRule[], payload: Record<string, unknown>): ValidationOutcome {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const violations: RuleViolation[] = [];

  for (const rule of rules) {
    let matched: boolean;
    try {
      matched = evaluateCondition(rule.condition, safePayload);
    } catch {
      matched = false; // fail-open
    }
    if (!matched) continue;

    let satisfied: boolean;
    try {
      satisfied = evaluateRequirement(rule.requirement, safePayload);
    } catch {
      satisfied = true; // fail-open
    }
    if (!satisfied) {
      violations.push({ ruleId: rule.id, ruleName: rule.name, errorMessage: rule.errorMessage });
    }
  }

  return {
    valid: violations.length === 0,
    rulesEvaluated: rules.length,
    violations,
    errors: violations.map((v) => v.errorMessage),
  };
}
