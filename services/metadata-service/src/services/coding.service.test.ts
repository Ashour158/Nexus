import { describe, it, expect } from 'vitest';
import {
  parsePattern,
  resolveScopeKey,
  renderCode,
  createCodingService,
  type AllocationContext,
} from './coding.service.js';
import type { CodingRule } from '../../../../node_modules/.prisma/metadata-client/index.js';

/* ─── Pattern Parser ──────────────────────────────────────────────────────── */

describe('parsePattern', () => {
  it('parses a simple PREFIX + SEQ pattern', () => {
    const tokens = parsePattern('{PREFIX}{SEQ:4}');
    expect(tokens).toEqual([
      { type: 'PREFIX' },
      { type: 'SEQ', digits: 4 },
    ]);
  });

  it('preserves literal text between tokens', () => {
    const tokens = parsePattern('{PREFIX}-{YYYY}-{SEQ:6}');
    expect(tokens).toEqual([
      { type: 'PREFIX' },
      { type: 'TEXT', value: '-' },
      { type: 'YYYY' },
      { type: 'TEXT', value: '-' },
      { type: 'SEQ', digits: 6 },
    ]);
  });

  it('handles all supported token types', () => {
    const tokens = parsePattern('{PREFIX}{YYYY}{YY}{MM}{DD}{Q}{TERRITORY}{BRANCH}{DEPT}{OWNER_INITIALS}{SEQ}{CATEGORY}');
    expect(tokens.map((t) => t.type)).toEqual([
      'PREFIX', 'YYYY', 'YY', 'MM', 'DD', 'Q', 'TERRITORY', 'BRANCH', 'DEPT',
      'OWNER_INITIALS', 'SEQ', 'CATEGORY',
    ]);
  });

  it('returns empty array for empty pattern', () => {
    expect(parsePattern('')).toEqual([]);
  });

  it('returns TEXT token for plain string without braces', () => {
    expect(parsePattern('HELLO')).toEqual([{ type: 'TEXT', value: 'HELLO' }]);
  });
});

/* ─── Scope Resolver ──────────────────────────────────────────────────────── */

describe('resolveScopeKey', () => {
  const now = new Date('2024-07-15');
  const ctx: AllocationContext = {
    tenantId: 'tenant_1',
    territoryId: 'territory_a',
    branchId: 'branch_x',
    teamId: 'team_alpha',
    category: 'premium',
  };

  it('resolves TENANT scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'TENANT', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1');
  });

  it('resolves MODULE scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'MODULE', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1:module');
  });

  it('resolves YEAR scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'YEAR', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1:2024');
  });

  it('resolves MONTH scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'MONTH', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1:2024-07');
  });

  it('resolves TERRITORY scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'TERRITORY', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1:territory_a');
  });

  it('resolves TERRITORY scope with fallback', () => {
    const key = resolveScopeKey({ sequenceScope: 'TERRITORY', resetPolicy: 'NEVER' }, { tenantId: 't' }, now);
    expect(key).toBe('t:default');
  });

  it('resolves BRANCH scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'BRANCH', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1:branch_x');
  });

  it('resolves TEAM scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'TEAM', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1:team_alpha');
  });

  it('resolves CATEGORY scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'CATEGORY', resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1:premium');
  });

  it('defaults to TENANT for unknown scope', () => {
    const key = resolveScopeKey({ sequenceScope: 'UNKNOWN' as any, resetPolicy: 'NEVER' }, ctx, now);
    expect(key).toBe('tenant_1');
  });
});

/* ─── Code Renderer ───────────────────────────────────────────────────────── */

describe('renderCode', () => {
  const rule = { prefix: 'ACC', separator: '-' };
  const now = new Date('2024-07-15');
  const ctx: AllocationContext = {
    tenantId: 'tenant_1',
    ownerId: 'user_abc',
    territoryId: 'NA',
    branchId: 'HQ',
    teamId: 'sales',
    category: 'enterprise',
  };

  it('renders PREFIX token', () => {
    const tokens = parsePattern('{PREFIX}');
    expect(renderCode(tokens, rule, 1, ctx, now)).toBe('ACC');
  });

  it('renders SEQ with default padding', () => {
    const tokens = parsePattern('{SEQ}');
    expect(renderCode(tokens, rule, 42, ctx, now)).toBe('000042');
  });

  it('renders SEQ with custom padding', () => {
    const tokens = parsePattern('{SEQ:4}');
    expect(renderCode(tokens, rule, 42, ctx, now)).toBe('0042');
  });

  it('renders year tokens', () => {
    expect(renderCode(parsePattern('{YYYY}'), rule, 1, ctx, now)).toBe('2024');
    expect(renderCode(parsePattern('{YY}'), rule, 1, ctx, now)).toBe('24');
  });

  it('renders month and day tokens', () => {
    expect(renderCode(parsePattern('{MM}'), rule, 1, ctx, now)).toBe('07');
    expect(renderCode(parsePattern('{DD}'), rule, 1, ctx, now)).toBe('15');
  });

  it('renders quarter token', () => {
    expect(renderCode(parsePattern('{Q}'), rule, 1, ctx, now)).toBe('Q3');
  });

  it('renders territory token', () => {
    expect(renderCode(parsePattern('{TERRITORY}'), rule, 1, ctx, now)).toBe('NA');
  });

  it('renders branch token with fallback', () => {
    expect(renderCode(parsePattern('{BRANCH}'), rule, 1, ctx, now)).toBe('HQ');
    expect(renderCode(parsePattern('{BRANCH}'), rule, 1, { tenantId: 't' }, now)).toBe('XX');
  });

  it('renders DEPT as team fallback', () => {
    expect(renderCode(parsePattern('{DEPT}'), rule, 1, ctx, now)).toBe('sales');
  });

  it('renders OWNER_INITIALS', () => {
    expect(renderCode(parsePattern('{OWNER_INITIALS}'), rule, 1, ctx, now)).toBe('US');
  });

  it('renders CATEGORY', () => {
    expect(renderCode(parsePattern('{CATEGORY}'), rule, 1, ctx, now)).toBe('enterprise');
  });

  it('renders full composite pattern', () => {
    const tokens = parsePattern('{PREFIX}-{YYYY}{MM}-{SEQ:4}');
    expect(renderCode(tokens, rule, 7, ctx, now)).toBe('ACC-202407-0007');
  });

  it('uses empty separator when separator is empty', () => {
    const tokens = parsePattern('{PREFIX}{SEQ:3}');
    expect(renderCode(tokens, { prefix: 'Q', separator: '' }, 5, ctx, now)).toBe('Q005');
  });
});

/* ─── Service Factory (previewCode) ───────────────────────────────────────── */

describe('createCodingService previewCode', () => {
  const mockPrisma = {} as any;
  const service = createCodingService(mockPrisma);

  const baseRule: CodingRule = {
    id: 'rule_1',
    tenantId: 'tenant_1',
    entityType: 'ACCOUNT',
    name: 'Account Code',
    prefix: 'ACC',
    pattern: '{PREFIX}-{YYYY}-{SEQ:4}',
    separator: '-',
    sequenceScope: 'TENANT',
    resetPolicy: 'NEVER',
    nextSequence: 1,
    isManualOverrideAllowed: false,
    isRequired: true,
    lockedAfterCreate: true,
    fallbackStrategy: 'USE_DEFAULT',
    effectiveFrom: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('previews code with rule nextSequence', async () => {
    const code = await service.previewCode(baseRule, { tenantId: 't' });
    const year = new Date().getFullYear();
    expect(code).toBe(`ACC-${year}-0001`);
  });

  it('previews code with explicit sampleSequence', async () => {
    const code = await service.previewCode(baseRule, { tenantId: 't' }, 99);
    const year = new Date().getFullYear();
    expect(code).toBe(`ACC-${year}-0099`);
  });
});
