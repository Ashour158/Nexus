import { describe, expect, it } from 'vitest';
import { evaluateBusinessRules, type BusinessRule } from '../rule-engine.js';

describe('evaluateBusinessRules', () => {
  it('blocks invalid transitions and collects actions from passing rules', () => {
    const rules: BusinessRule[] = [
      {
        id: 'deal-transition',
        module: 'deal',
        type: 'transition',
        name: 'Closed deals require allowed stage movement',
        enabled: true,
        severity: 'error',
        message: 'This stage transition is not allowed.',
        conditions: [
          {
            field: 'stage',
            op: 'transitionAllowed',
            from: ['Proposal'],
            to: ['Negotiation'],
          },
        ],
      },
      {
        id: 'deal-routing',
        module: 'deal',
        type: 'routing',
        name: 'Route enterprise deal',
        enabled: true,
        severity: 'info',
        message: 'Enterprise deal routed.',
        conditions: [{ field: 'segment', op: 'equals', value: 'Enterprise' }],
        actions: [{ type: 'assign', payload: { queue: 'enterprise-sales' } }],
      },
    ];

    const result = evaluateBusinessRules(rules, {
      module: 'deal',
      record: { stage: 'Closed Won', segment: 'Enterprise' },
      previousRecord: { stage: 'Proposal' },
      transition: { field: 'stage', from: 'Proposal', to: 'Closed Won' },
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        ruleId: 'deal-transition',
        severity: 'error',
      }),
    ]);
    expect(result.actions).toEqual([{ type: 'assign', payload: { queue: 'enterprise-sales' } }]);
  });
});
