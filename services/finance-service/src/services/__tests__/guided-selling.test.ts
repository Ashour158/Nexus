import { describe, it, expect } from 'vitest';
import { evaluateGuidedSelling, type GuidedRuleLike } from '../guided-selling.js';

/**
 * Pure guided-selling evaluator tests — deterministic, no DB.
 */

const rules: GuidedRuleLike[] = [
  {
    id: 'r_enterprise',
    name: 'Enterprise',
    conditions: { size: 'enterprise' },
    recommendedProductIds: ['prod_ent'],
    recommendedOptionIds: ['opt_sso'],
    weight: 10,
    isActive: true,
  },
  {
    id: 'r_bigseats',
    name: 'Big seats',
    conditions: { seats: { gte: 100 } },
    recommendedProductIds: ['prod_ent'],
    recommendedOptionIds: ['opt_priority'],
    weight: 5,
    isActive: true,
  },
  {
    id: 'r_smb',
    name: 'SMB',
    conditions: { size: ['smb', 'startup'] },
    recommendedProductIds: ['prod_smb'],
    recommendedOptionIds: [],
    weight: 3,
    isActive: true,
  },
];

describe('evaluateGuidedSelling', () => {
  it('matches scalar equality and numeric operators, ranking by summed weight', () => {
    const res = evaluateGuidedSelling({
      rules,
      answers: { size: 'enterprise', seats: 250 },
    });
    expect(res.matchedRules.map((m) => m.id).sort()).toEqual(['r_bigseats', 'r_enterprise']);
    // prod_ent scored by both rules (10 + 5) → ranked first.
    expect(res.recommendedProducts[0]).toEqual({ productId: 'prod_ent', score: 15 });
    expect(res.suggestedConfiguration.recommendedProductIds).toEqual(['prod_ent']);
    expect(res.suggestedConfiguration.recommendedOptionIds.sort()).toEqual(['opt_priority', 'opt_sso']);
  });

  it('matches array-membership conditions', () => {
    const res = evaluateGuidedSelling({ rules, answers: { size: 'startup' } });
    expect(res.matchedRules.map((m) => m.id)).toEqual(['r_smb']);
    expect(res.recommendedProducts).toEqual([{ productId: 'prod_smb', score: 3 }]);
  });

  it('numeric operator fails when threshold not met', () => {
    const res = evaluateGuidedSelling({ rules, answers: { seats: 20 } });
    expect(res.matchedRules).toEqual([]);
    expect(res.recommendedProducts).toEqual([]);
  });

  it('treats an empty-conditions rule as a catch-all default', () => {
    const def: GuidedRuleLike[] = [
      { id: 'r_def', name: 'default', conditions: {}, recommendedProductIds: ['prod_x'], recommendedOptionIds: [], weight: 1, isActive: true },
    ];
    const res = evaluateGuidedSelling({ rules: def, answers: {} });
    expect(res.recommendedProducts).toEqual([{ productId: 'prod_x', score: 1 }]);
  });

  it('ignores inactive rules and coerces string answers to numbers', () => {
    const res = evaluateGuidedSelling({
      rules: rules.map((r) => (r.id === 'r_enterprise' ? { ...r, isActive: false } : r)),
      answers: { seats: '150' },
    });
    expect(res.matchedRules.map((m) => m.id)).toEqual(['r_bigseats']);
  });
});
