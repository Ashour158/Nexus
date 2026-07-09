/**
 * Pure, dependency-free territory rule-evaluation engine.
 *
 * A `TerritoryRule` is a single field predicate (field / operator / value).
 * A territory matches a record when ALL of its rules pass (logical AND).
 * `matchTerritory` walks territories in priority order (highest first) and
 * returns the first territory whose rules all match, along with the ids of
 * the rules that matched (for audit traceability). If no rule-bearing
 * territory matches, a territory flagged `isDefault` is used as a fallback.
 *
 * This module has no Prisma / Kafka imports so it can be unit-tested in
 * isolation. It is intentionally fail-open: an unknown operator evaluates to
 * `false` (the record simply does not match that rule) rather than throwing.
 */

/** Supported predicate operators. */
export type RuleOperator = 'eq' | 'neq' | 'contains' | 'gte' | 'lte' | 'in';

/** A single field predicate against a record. */
export interface EvalRule {
  id?: string;
  field: string;
  operator: string;
  value: string;
}

/** A territory as seen by the rule engine (subset of the Prisma model). */
export interface EvalTerritory<R extends EvalRule = EvalRule> {
  id: string;
  priority: number;
  ownerIds: string[];
  isDefault?: boolean;
  rules: R[];
}

/** Result of a successful match. */
export interface MatchResult<T extends EvalTerritory = EvalTerritory> {
  territory: T;
  /** ids of the rules that matched (empty for a rule-less / default territory). */
  matchedRuleIds: string[];
  /** true when the territory was selected purely as the configured default. */
  viaDefault: boolean;
}

/**
 * Evaluate a single predicate against an actual value. Fail-open: unknown
 * operators and un-comparable values yield `false`, never throw.
 */
export function ruleMatch(operator: string, actual: unknown, expected: string): boolean {
  const a = actual ?? '';
  switch (operator) {
    case 'eq':
      return String(a) === expected;
    case 'neq':
      return String(a) !== expected;
    case 'contains':
      return String(a).toLowerCase().includes(expected.toLowerCase());
    case 'gte': {
      const na = Number(a);
      const ne = Number(expected);
      return Number.isFinite(na) && Number.isFinite(ne) && na >= ne;
    }
    case 'lte': {
      const na = Number(a);
      const ne = Number(expected);
      return Number.isFinite(na) && Number.isFinite(ne) && na <= ne;
    }
    case 'in':
      return expected
        .split(',')
        .map((x) => x.trim())
        .includes(String(a));
    default:
      return false;
  }
}

/**
 * Returns true and the matched rule ids when every rule of the territory passes
 * against the record. A territory with zero rules matches nothing here (it can
 * still be selected as a default) so that empty-rule territories never silently
 * capture every record.
 */
export function evaluateTerritory<T extends EvalTerritory>(
  territory: T,
  record: Record<string, unknown>
): { matched: boolean; matchedRuleIds: string[] } {
  if (territory.rules.length === 0) {
    return { matched: false, matchedRuleIds: [] };
  }
  const matchedRuleIds: string[] = [];
  for (const rule of territory.rules) {
    if (!ruleMatch(rule.operator, record[rule.field], rule.value)) {
      return { matched: false, matchedRuleIds: [] };
    }
    if (rule.id) matchedRuleIds.push(rule.id);
  }
  return { matched: true, matchedRuleIds };
}

/**
 * Pick the winning territory for a record. First matching rule-set by priority
 * wins; if none match, the highest-priority `isDefault` territory is used.
 * `territories` need not be pre-sorted — this sorts a shallow copy by priority
 * descending (stable for equal priorities in the given order).
 */
export function matchTerritory<T extends EvalTerritory>(
  territories: readonly T[],
  record: Record<string, unknown>
): MatchResult<T> | null {
  const ordered = [...territories].sort((x, y) => y.priority - x.priority);
  for (const territory of ordered) {
    const { matched, matchedRuleIds } = evaluateTerritory(territory, record);
    if (matched) {
      return { territory, matchedRuleIds, viaDefault: false };
    }
  }
  const fallback = ordered.find((t) => t.isDefault);
  if (fallback) {
    return { territory: fallback, matchedRuleIds: [], viaDefault: true };
  }
  return null;
}
