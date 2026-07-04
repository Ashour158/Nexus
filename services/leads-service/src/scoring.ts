/**
 * Lead scoring engine.
 *
 * Wires the stored `LeadScoringRule` rows (previously dead config — persisted
 * but read by nobody) into the lead score computed on create/update.
 *
 * Design contract: FAIL-OPEN. If a tenant has no active rules, or if loading
 * or evaluating rules throws for any reason, we fall back to the existing
 * default heuristic score. Scoring must NEVER break lead create/update.
 */

/** Minimal shape of the fields we read off a lead for scoring. */
export interface ScorableLead {
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  website?: string | null;
  annualRevenue?: unknown;
  employeeCount?: number | null;
  country?: string | null;
  source?: string | null;
  gdprConsent?: boolean | null;
  [key: string]: unknown;
}

/**
 * A stored scoring rule. `condition` is free-form JSON; we support a common
 * `{ field, operator, value }` shape and degrade gracefully for anything else.
 */
export interface LeadScoringRuleRow {
  id: string;
  tenantId: string;
  name: string;
  signal: string;
  points: number;
  condition: unknown;
  isActive: boolean;
}

interface NormalizedCondition {
  field: string;
  operator: string;
  value?: unknown;
}

/**
 * Default heuristic scoring — the behaviour that was implicitly in effect
 * before configurable rules existed (a lead's score defaulted to 0, and a
 * complete profile is worth more). Kept deliberately simple and total so it
 * can never throw. This is the fail-open fallback.
 */
export function defaultLeadScore(lead: ScorableLead): number {
  let score = 0;
  if (str(lead.email)) score += 10;
  if (str(lead.phone)) score += 5;
  if (str(lead.company)) score += 10;
  if (str(lead.jobTitle)) score += 5;
  if (str(lead.industry)) score += 5;
  if (str(lead.website)) score += 5;
  if (num(lead.employeeCount) && num(lead.employeeCount)! >= 200) score += 10;
  if (num(lead.annualRevenue) && num(lead.annualRevenue)! >= 1_000_000) score += 10;
  return clampScore(score);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  // Prisma Decimal exposes toNumber()
  if (v && typeof (v as { toNumber?: unknown }).toNumber === 'function') {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const rounded = Math.round(score);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

/** Normalize a rule's free-form `condition` JSON into `{ field, operator, value }`. */
function normalizeCondition(condition: unknown): NormalizedCondition | null {
  if (!condition || typeof condition !== 'object') return null;
  const c = condition as Record<string, unknown>;
  const field = c.field ?? c.attribute ?? c.key;
  if (typeof field !== 'string' || field.length === 0) return null;
  const operator = typeof c.operator === 'string' ? c.operator : typeof c.op === 'string' ? c.op : 'exists';
  return { field, operator: operator.toLowerCase(), value: c.value ?? c.val };
}

function getLeadField(lead: ScorableLead, field: string): unknown {
  return Object.prototype.hasOwnProperty.call(lead, field) ? lead[field] : undefined;
}

/** Evaluate a single normalized condition against a lead. Total (never throws). */
function matches(lead: ScorableLead, cond: NormalizedCondition): boolean {
  const actual = getLeadField(lead, cond.field);
  const { operator, value } = cond;

  switch (operator) {
    case 'exists':
    case 'is_set':
    case 'present':
      return actual !== undefined && actual !== null && actual !== '' && actual !== false;
    case 'not_exists':
    case 'is_empty':
      return actual === undefined || actual === null || actual === '' || actual === false;
    case 'eq':
    case 'equals':
    case '==':
      return looseEquals(actual, value);
    case 'ne':
    case 'not_equals':
    case '!=':
      return !looseEquals(actual, value);
    case 'contains': {
      const a = typeof actual === 'string' ? actual.toLowerCase() : '';
      const v = typeof value === 'string' ? value.toLowerCase() : String(value ?? '').toLowerCase();
      return a.includes(v);
    }
    case 'in': {
      const arr = Array.isArray(value) ? value : [];
      return arr.some((v) => looseEquals(actual, v));
    }
    case 'gt':
    case '>': {
      const a = num(actual), v = num(value);
      return a !== null && v !== null && a > v;
    }
    case 'gte':
    case '>=': {
      const a = num(actual), v = num(value);
      return a !== null && v !== null && a >= v;
    }
    case 'lt':
    case '<': {
      const a = num(actual), v = num(value);
      return a !== null && v !== null && a < v;
    }
    case 'lte':
    case '<=': {
      const a = num(actual), v = num(value);
      return a !== null && v !== null && a <= v;
    }
    default:
      // Unknown operator → do not match (fail-open at the rule level).
      return false;
  }
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const an = num(a), bn = num(b);
  if (an !== null && bn !== null) return an === bn;
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

/**
 * Evaluate active tenant scoring rules against a lead and return the aggregate
 * score. A rule with no usable condition is treated as always-matching on its
 * signal (a flat contribution), so simple "signal + points" rules still work.
 */
export function scoreWithRules(lead: ScorableLead, rules: LeadScoringRuleRow[]): number {
  let score = 0;
  for (const rule of rules) {
    if (!rule || rule.isActive === false) continue;
    const points = num(rule.points);
    if (points === null) continue;
    const cond = normalizeCondition(rule.condition);
    // No parseable condition → treat as an unconditional signal contribution.
    const hit = cond === null ? true : matches(lead, cond);
    if (hit) score += points;
  }
  return clampScore(score);
}

/**
 * Compute a lead's score using configurable rules when present, otherwise the
 * default heuristic. FAIL-OPEN: any error, or an empty rule set, falls back to
 * the default score and never throws.
 *
 * @param prisma  Tenant-scoped Prisma client (leads-client).
 * @param tenantId  Tenant whose rules to evaluate.
 * @param lead  The lead data being created/updated.
 */
export async function computeLeadScore(
  // Tenant-scoped Prisma client. Typed loosely to accept both the REST
  // client-extension type and the GraphQL `any` context without friction.
  prisma: { leadScoringRule: { findMany: (args: any) => Promise<any[]> } },
  tenantId: string | null | undefined,
  lead: ScorableLead
): Promise<number> {
  try {
    if (!tenantId) return defaultLeadScore(lead);
    const rules = (await prisma.leadScoringRule.findMany({
      where: { tenantId, isActive: true },
    })) as LeadScoringRuleRow[];
    if (!Array.isArray(rules) || rules.length === 0) {
      return defaultLeadScore(lead);
    }
    return scoreWithRules(lead, rules);
  } catch {
    // Fail-open: never let scoring break lead create/update.
    try {
      return defaultLeadScore(lead);
    } catch {
      return 0;
    }
  }
}

/** Map a numeric score to the coarse rating enum used by the Lead model. */
export function ratingForScore(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= 70) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
}
