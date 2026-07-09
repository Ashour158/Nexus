import { describe, it, expect } from 'vitest';
import { ruleMatch, evaluateTerritory, matchTerritory, type EvalTerritory } from '../rule-engine.js';

describe('ruleMatch', () => {
  it('eq / neq', () => {
    expect(ruleMatch('eq', 'US', 'US')).toBe(true);
    expect(ruleMatch('eq', 'DE', 'US')).toBe(false);
    expect(ruleMatch('neq', 'DE', 'US')).toBe(true);
  });

  it('contains is case-insensitive', () => {
    expect(ruleMatch('contains', 'Enterprise SaaS', 'saas')).toBe(true);
    expect(ruleMatch('contains', 'Retail', 'saas')).toBe(false);
  });

  it('gte / lte are numeric and reject non-numbers', () => {
    expect(ruleMatch('gte', 500, '100')).toBe(true);
    expect(ruleMatch('lte', 50, '100')).toBe(true);
    expect(ruleMatch('gte', 'abc', '100')).toBe(false);
  });

  it('in matches CSV membership', () => {
    expect(ruleMatch('in', 'West', 'East, West, North')).toBe(true);
    expect(ruleMatch('in', 'South', 'East, West')).toBe(false);
  });

  it('unknown operator fails closed', () => {
    expect(ruleMatch('regex', 'x', 'x')).toBe(false);
  });
});

describe('evaluateTerritory', () => {
  it('requires ALL rules to pass and returns matched rule ids', () => {
    const t: EvalTerritory = {
      id: 't1',
      priority: 10,
      ownerIds: ['u1'],
      rules: [
        { id: 'r1', field: 'country', operator: 'eq', value: 'US' },
        { id: 'r2', field: 'industry', operator: 'contains', value: 'saas' },
      ],
    };
    expect(evaluateTerritory(t, { country: 'US', industry: 'Enterprise SaaS' })).toEqual({
      matched: true,
      matchedRuleIds: ['r1', 'r2'],
    });
    expect(evaluateTerritory(t, { country: 'US', industry: 'Retail' }).matched).toBe(false);
  });

  it('rule-less territory does not match by itself', () => {
    const t: EvalTerritory = { id: 't0', priority: 0, ownerIds: ['u1'], rules: [] };
    expect(evaluateTerritory(t, { country: 'US' }).matched).toBe(false);
  });
});

describe('matchTerritory', () => {
  const highPriorityUS: EvalTerritory = {
    id: 'us',
    priority: 20,
    ownerIds: ['us-owner'],
    rules: [{ id: 'r-us', field: 'country', operator: 'eq', value: 'US' }],
  };
  const lowPriorityWest: EvalTerritory = {
    id: 'west',
    priority: 5,
    ownerIds: ['west-owner'],
    rules: [{ id: 'r-west', field: 'region', operator: 'eq', value: 'West' }],
  };
  const defaultTerritory: EvalTerritory = {
    id: 'default',
    priority: 0,
    ownerIds: ['fallback-owner'],
    isDefault: true,
    rules: [],
  };

  it('first matching rule-set by priority wins', () => {
    const m = matchTerritory([lowPriorityWest, highPriorityUS], { country: 'US', region: 'West' });
    expect(m?.territory.id).toBe('us');
    expect(m?.viaDefault).toBe(false);
    expect(m?.matchedRuleIds).toEqual(['r-us']);
  });

  it('falls back to the default territory when nothing matches', () => {
    const m = matchTerritory([highPriorityUS, defaultTerritory], { country: 'DE' });
    expect(m?.territory.id).toBe('default');
    expect(m?.viaDefault).toBe(true);
    expect(m?.matchedRuleIds).toEqual([]);
  });

  it('returns null when nothing matches and no default configured', () => {
    expect(matchTerritory([highPriorityUS], { country: 'DE' })).toBeNull();
  });
});
