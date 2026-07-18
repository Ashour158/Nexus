import { NotFoundError } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

// ─── Pure evaluator types (DB-agnostic, deterministic) ────────────────────────

export type GuidedAnswer = string | number | boolean | Array<string | number> | null | undefined;
export type GuidedAnswers = Record<string, GuidedAnswer>;

export interface GuidedRuleLike {
  id: string;
  name: string;
  conditions: Record<string, unknown>;
  recommendedProductIds: string[];
  recommendedOptionIds: string[];
  weight: number;
  isActive: boolean;
}

export interface GuidedRecommendation {
  matchedRules: { id: string; name: string; weight: number }[];
  recommendedProducts: { productId: string; score: number }[];
  recommendedOptions: { optionId: string; score: number }[];
  suggestedConfiguration: {
    recommendedProductIds: string[];
    recommendedOptionIds: string[];
  };
}

// ─── Condition matching ───────────────────────────────────────────────────────

function asComparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  return String(value);
}

function looseEquals(answer: unknown, expected: unknown): boolean {
  const a = asComparable(answer);
  const e = asComparable(expected);
  if (a === null || e === null) return a === e;
  // Numeric coercion so "10" (form value) matches 10 (rule spec) and vice versa.
  const an = typeof a === 'number' ? a : Number(a);
  const en = typeof e === 'number' ? e : Number(e);
  if (Number.isFinite(an) && Number.isFinite(en)) return an === en;
  // Boolean coercion for yes/no/true/false style answers.
  if (typeof a === 'boolean' || typeof e === 'boolean') {
    return toBool(a) === toBool(e);
  }
  return String(a).trim().toLowerCase() === String(e).trim().toLowerCase();
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function answerValues(answer: GuidedAnswer): Array<string | number | boolean> {
  if (Array.isArray(answer)) return answer.filter((v) => v !== null && v !== undefined);
  if (answer === null || answer === undefined) return [];
  return [answer];
}

/**
 * Evaluates one condition entry (`answer[key]` vs `spec`) supporting:
 *   - scalar equality (with numeric / boolean coercion),
 *   - array membership (answer matches any listed value),
 *   - numeric operators `{ gt, gte, lt, lte, ne }`,
 *   - `{ in: [...] }` / `{ eq: v }` explicit forms.
 * Unknown operator objects never match (fail-closed).
 */
function matchesCondition(answer: GuidedAnswer, spec: unknown): boolean {
  const values = answerValues(answer);

  if (Array.isArray(spec)) {
    return values.some((v) => spec.some((s) => looseEquals(v, s)));
  }

  if (spec && typeof spec === 'object') {
    const obj = spec as Record<string, unknown>;
    const num = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    let handled = false;
    let ok = true;
    const check = (present: boolean, pass: () => boolean) => {
      if (!present) return;
      handled = true;
      if (!pass()) ok = false;
    };
    check('eq' in obj, () => values.some((v) => looseEquals(v, obj.eq)));
    check('ne' in obj, () => values.length > 0 && values.every((v) => !looseEquals(v, obj.ne)));
    check('in' in obj, () =>
      Array.isArray(obj.in) && values.some((v) => (obj.in as unknown[]).some((s) => looseEquals(v, s)))
    );
    check('gt' in obj, () => num.length > 0 && num.some((n) => n > Number(obj.gt)));
    check('gte' in obj, () => num.length > 0 && num.some((n) => n >= Number(obj.gte)));
    check('lt' in obj, () => num.length > 0 && num.some((n) => n < Number(obj.lt)));
    check('lte' in obj, () => num.length > 0 && num.some((n) => n <= Number(obj.lte)));
    return handled ? ok : false;
  }

  // Scalar spec.
  return values.some((v) => looseEquals(v, spec));
}

/**
 * Deterministic guided-selling evaluator. A rule matches when EVERY key in its
 * `conditions` is satisfied by the buyer's answers. Matched rules contribute
 * their `weight` to each recommended product / option; results are ranked by
 * descending score then id so output is reproducible.
 */
export function evaluateGuidedSelling(input: {
  rules: GuidedRuleLike[];
  answers: GuidedAnswers;
}): GuidedRecommendation {
  const answers = input.answers ?? {};
  const rules = input.rules
    .filter((r) => r.isActive)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const matchedRules: GuidedRecommendation['matchedRules'] = [];
  const productScore = new Map<string, number>();
  const optionScore = new Map<string, number>();

  for (const rule of rules) {
    const conditions = rule.conditions && typeof rule.conditions === 'object' ? rule.conditions : {};
    const entries = Object.entries(conditions);
    // A rule with no conditions is a catch-all default (always matches).
    const matched = entries.every(([key, spec]) => matchesCondition(answers[key], spec));
    if (!matched) continue;

    const weight = Number(rule.weight) || 0;
    matchedRules.push({ id: rule.id, name: rule.name, weight });
    for (const productId of rule.recommendedProductIds) {
      productScore.set(productId, (productScore.get(productId) ?? 0) + weight);
    }
    for (const optionId of rule.recommendedOptionIds) {
      optionScore.set(optionId, (optionScore.get(optionId) ?? 0) + weight);
    }
  }

  const rank = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))
      .map(([id, score]) => ({ id, score }));

  const recommendedProducts = rank(productScore).map((r) => ({ productId: r.id, score: r.score }));
  const recommendedOptions = rank(optionScore).map((r) => ({ optionId: r.id, score: r.score }));

  return {
    matchedRules,
    recommendedProducts,
    recommendedOptions,
    suggestedConfiguration: {
      recommendedProductIds: recommendedProducts.map((p) => p.productId),
      recommendedOptionIds: recommendedOptions.map((o) => o.optionId),
    },
  };
}

// ─── DB-backed service ────────────────────────────────────────────────────────

export function createGuidedSellingService(prisma: FinancePrisma) {
  return {
    evaluateGuidedSelling,

    /**
     * Loads an active flow's rules and evaluates the buyer's answers into ranked
     * product / option recommendations plus a suggested configuration that can be
     * fed to the configurator's apply-to-quote endpoint.
     */
    async recommend(
      tenantId: string,
      flowId: string,
      answers: GuidedAnswers
    ): Promise<GuidedRecommendation> {
      const flow = await prisma.guidedSellingFlow.findFirst({ where: { id: flowId, tenantId } });
      if (!flow) throw new NotFoundError('GuidedSellingFlow', flowId);

      const rules = await prisma.guidedSellingRule.findMany({
        where: { tenantId, flowId, isActive: true },
      });

      return evaluateGuidedSelling({
        rules: rules.map((r) => ({
          id: r.id,
          name: r.name,
          conditions: (r.conditions as Record<string, unknown>) ?? {},
          recommendedProductIds: r.recommendedProductIds,
          recommendedOptionIds: r.recommendedOptionIds,
          weight: r.weight,
          isActive: r.isActive,
        })),
        answers,
      });
    },
  };
}

export type GuidedSellingService = ReturnType<typeof createGuidedSellingService>;
