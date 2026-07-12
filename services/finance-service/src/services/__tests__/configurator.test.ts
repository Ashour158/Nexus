import { describe, it, expect } from 'vitest';
import {
  resolveConfiguration,
  type OptionGroupLike,
  type ProductOptionLike,
  type ConfigRuleLike,
} from '../configurator.js';

/**
 * Pure resolver tests — deterministic configuration logic, no DB.
 */

const groups: OptionGroupLike[] = [
  { id: 'g_cpu', name: 'CPU', minSelect: 1, maxSelect: 1, required: true, sortOrder: 0 },
  { id: 'g_addons', name: 'Add-ons', minSelect: 0, maxSelect: 2, required: false, sortOrder: 1 },
];

const options: ProductOptionLike[] = [
  { id: 'o_cpu_basic', optionGroupId: 'g_cpu', name: 'Basic CPU', priceDelta: 0, isDefault: true, sortOrder: 0 },
  { id: 'o_cpu_pro', optionGroupId: 'g_cpu', name: 'Pro CPU', priceDelta: 500, isDefault: false, sortOrder: 1 },
  { id: 'o_warranty', optionGroupId: 'g_addons', name: 'Warranty', priceDelta: 100, isDefault: false, sortOrder: 0 },
  { id: 'o_support', optionGroupId: 'g_addons', name: 'Support', priceDelta: 200, isDefault: false, sortOrder: 1 },
  { id: 'o_install', optionGroupId: 'g_addons', name: 'Install', priceDelta: 150, isDefault: false, sortOrder: 2 },
];

describe('resolveConfiguration', () => {
  it('accepts a valid selection and sums option price deltas', () => {
    const res = resolveConfiguration({
      groups,
      options,
      rules: [],
      selectedOptionIds: ['o_cpu_pro', 'o_warranty'],
    });
    expect(res.valid).toBe(true);
    expect(res.violations).toEqual([]);
    expect(res.totalPriceDelta).toBe(600);
    expect(res.effectiveOptionIds).toEqual(['o_cpu_pro', 'o_warranty']);
  });

  it('flags a required group with no selection', () => {
    const res = resolveConfiguration({ groups, options, rules: [], selectedOptionIds: [] });
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.rule === 'GROUP_REQUIRED')).toBe(true);
  });

  it('enforces maxSelect per group', () => {
    const res = resolveConfiguration({
      groups,
      options,
      rules: [],
      selectedOptionIds: ['o_cpu_basic', 'o_warranty', 'o_support', 'o_install'],
    });
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.rule === 'GROUP_MAX')).toBe(true);
  });

  it('enforces minSelect per group', () => {
    const g: OptionGroupLike[] = [
      { id: 'g_cpu', name: 'CPU', minSelect: 2, maxSelect: 3, required: false, sortOrder: 0 },
    ];
    const res = resolveConfiguration({
      groups: g,
      options: options.filter((o) => o.optionGroupId === 'g_cpu'),
      rules: [],
      selectedOptionIds: ['o_cpu_basic'],
    });
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.rule === 'GROUP_MIN')).toBe(true);
  });

  it('rejects unknown options', () => {
    const res = resolveConfiguration({
      groups,
      options,
      rules: [],
      selectedOptionIds: ['o_cpu_basic', 'o_nope'],
    });
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.rule === 'UNKNOWN_OPTION')).toBe(true);
  });

  it('enforces REQUIRES', () => {
    const rules: ConfigRuleLike[] = [
      {
        id: 'r1',
        name: 'Pro needs Support',
        type: 'REQUIRES',
        whenOptionId: 'o_cpu_pro',
        thenOptionId: 'o_support',
        isActive: true,
      },
    ];
    const bad = resolveConfiguration({ groups, options, rules, selectedOptionIds: ['o_cpu_pro'] });
    expect(bad.valid).toBe(false);
    expect(bad.violations.some((v) => v.rule === 'Pro needs Support')).toBe(true);

    const good = resolveConfiguration({
      groups,
      options,
      rules,
      selectedOptionIds: ['o_cpu_pro', 'o_support'],
    });
    expect(good.valid).toBe(true);
  });

  it('enforces EXCLUDES', () => {
    const rules: ConfigRuleLike[] = [
      {
        id: 'r2',
        name: 'No warranty with install',
        type: 'EXCLUDES',
        whenOptionId: 'o_warranty',
        thenOptionId: 'o_install',
        isActive: true,
      },
    ];
    const res = resolveConfiguration({
      groups,
      options,
      rules,
      selectedOptionIds: ['o_cpu_basic', 'o_warranty', 'o_install'],
    });
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.rule === 'No warranty with install')).toBe(true);
  });

  it('applies AUTO_ADD (transitively) and folds price deltas', () => {
    const rules: ConfigRuleLike[] = [
      { id: 'a1', name: 'Pro auto-adds Warranty', type: 'AUTO_ADD', whenOptionId: 'o_cpu_pro', thenOptionId: 'o_warranty', isActive: true },
      { id: 'a2', name: 'Warranty auto-adds Support', type: 'AUTO_ADD', whenOptionId: 'o_warranty', thenOptionId: 'o_support', isActive: true },
    ];
    const res = resolveConfiguration({ groups, options, rules, selectedOptionIds: ['o_cpu_pro'] });
    expect(res.valid).toBe(true);
    expect(res.autoAdded).toEqual(['o_support', 'o_warranty']);
    // 500 (pro) + 100 (warranty) + 200 (support)
    expect(res.totalPriceDelta).toBe(800);
  });

  it('applies PRICE_ADJUST rules', () => {
    const rules: ConfigRuleLike[] = [
      { id: 'p1', name: 'Pro surcharge', type: 'PRICE_ADJUST', whenOptionId: 'o_cpu_pro', thenOptionId: null, adjustment: 50, isActive: true },
    ];
    const res = resolveConfiguration({ groups, options, rules, selectedOptionIds: ['o_cpu_pro'] });
    expect(res.valid).toBe(true);
    expect(res.priceAdjustments).toEqual([{ rule: 'Pro surcharge', amount: 50 }]);
    // 500 (pro) + 50 (adjust)
    expect(res.totalPriceDelta).toBe(550);
  });

  it('ignores inactive rules', () => {
    const rules: ConfigRuleLike[] = [
      { id: 'r3', name: 'inactive', type: 'REQUIRES', whenOptionId: 'o_cpu_pro', thenOptionId: 'o_support', isActive: false },
    ];
    const res = resolveConfiguration({ groups, options, rules, selectedOptionIds: ['o_cpu_pro'] });
    expect(res.valid).toBe(true);
  });
});
