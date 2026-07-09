/**
 * Coding / Numbering Engine — Section 45.
 *
 * Tenant-sc configurable record reference generation with atomic
 * sequence allocation, pattern tokenization, and scope isolation.
 */

import type { MetadataPrisma } from '../prisma.js';
import type { CodingRule, CodingAllocationLog } from '../../../../node_modules/.prisma/metadata-client/index.js';

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface AllocationContext {
  tenantId: string;
  ownerId?: string;
  territoryId?: string;
  branchId?: string;
  teamId?: string;
  category?: string;
  manualCode?: string;
}

export interface ParsedToken {
  type:
    | 'PREFIX'
    | 'YYYY'
    | 'YY'
    | 'MM'
    | 'DD'
    | 'Q'
    | 'TERRITORY'
    | 'BRANCH'
    | 'DEPT'
    | 'OWNER_INITIALS'
    | 'SEQ'
    | 'CATEGORY'
    | 'TEXT';
  value?: string;
  digits?: number;
}

/* ─── Pattern Parser ──────────────────────────────────────────────────────── */

const TOKEN_REGEX = /\{(PREFIX|YYYY|YY|MM|DD|Q|TERRITORY|BRANCH|DEPT|OWNER_INITIALS|SEQ|CATEGORY)(?::(\d+))?\}/g;

export function parsePattern(pattern: string): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(pattern)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'TEXT', value: pattern.slice(lastIndex, match.index) });
    }
    const type = match[1] as ParsedToken['type'];
    const digits = match[2] ? parseInt(match[2], 10) : undefined;
    tokens.push({ type, digits });
    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < pattern.length) {
    tokens.push({ type: 'TEXT', value: pattern.slice(lastIndex) });
  }

  return tokens;
}

/* ─── Scope Resolver ──────────────────────────────────────────────────────── */

export function resolveScopeKey(
  rule: Pick<CodingRule, 'sequenceScope' | 'resetPolicy'>,
  ctx: AllocationContext,
  now = new Date()
): string {
  const parts: string[] = [];

  switch (rule.sequenceScope) {
    case 'TENANT':
      parts.push(ctx.tenantId);
      break;
    case 'MODULE':
      parts.push(ctx.tenantId, 'module');
      break;
    case 'YEAR':
      parts.push(ctx.tenantId, String(now.getFullYear()));
      break;
    case 'MONTH':
      parts.push(ctx.tenantId, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      break;
    case 'TERRITORY':
      parts.push(ctx.tenantId, ctx.territoryId ?? 'default');
      break;
    case 'BRANCH':
      parts.push(ctx.tenantId, ctx.branchId ?? 'default');
      break;
    case 'TEAM':
      parts.push(ctx.tenantId, ctx.teamId ?? 'default');
      break;
    case 'CATEGORY':
      parts.push(ctx.tenantId, ctx.category ?? 'default');
      break;
    default:
      parts.push(ctx.tenantId);
  }

  return parts.join(':');
}

/* ─── Code Renderer ───────────────────────────────────────────────────────── */

export function renderCode(
  tokens: ParsedToken[],
  rule: Pick<CodingRule, 'prefix' | 'separator'>,
  sequence: number,
  ctx: AllocationContext,
  now = new Date()
): string {
  const hasLiteralText = tokens.some((t) => t.type === 'TEXT');
  const parts: string[] = [];

  for (const token of tokens) {
    if (token.type === 'TEXT') {
      parts.push(token.value ?? '');
      continue;
    }

    let value = '';
    switch (token.type) {
      case 'PREFIX':
        value = rule.prefix;
        break;
      case 'YYYY':
        value = String(now.getFullYear());
        break;
      case 'YY':
        value = String(now.getFullYear()).slice(-2);
        break;
      case 'MM':
        value = String(now.getMonth() + 1).padStart(2, '0');
        break;
      case 'DD':
        value = String(now.getDate()).padStart(2, '0');
        break;
      case 'Q':
        value = `Q${Math.floor(now.getMonth() / 3) + 1}`;
        break;
      case 'TERRITORY':
        value = ctx.territoryId ?? 'XX';
        break;
      case 'BRANCH':
        value = ctx.branchId ?? 'XX';
        break;
      case 'DEPT':
        value = ctx.teamId ?? 'XX';
        break;
      case 'OWNER_INITIALS':
        value = ctx.ownerId ? ctx.ownerId.slice(0, 2).toUpperCase() : 'XX';
        break;
      case 'SEQ':
        value = String(sequence).padStart(token.digits ?? 6, '0');
        break;
      case 'CATEGORY':
        value = ctx.category ?? 'GEN';
        break;
    }

    if (value !== '') {
      parts.push(value);
    }
  }

  if (hasLiteralText) {
    return parts.join('');
  }
  return parts.join(rule.separator);
}

/* ─── Service Factory ─────────────────────────────────────────────────────── */

export function createCodingService(prisma: MetadataPrisma) {
  /* ─── Sequence Allocator ──────────────────────────────────────────────── */

  async function allocateNextSequence(
    tenantId: string,
    entityType: string,
    scopeKey: string
  ): Promise<number> {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.codingSequence.findUnique({
        where: { tenantId_entityType_scopeKey: { tenantId, entityType, scopeKey } },
      });

      if (existing) {
        const updated = await tx.codingSequence.update({
          where: { id: existing.id },
          data: { nextValue: { increment: 1 } },
        });
        return updated.nextValue - 1;
      }

      await tx.codingSequence.create({
        data: { tenantId, entityType, scopeKey, nextValue: 2 },
      });
      return 1;
    });

    return result;
  }

  /* ─── Public API ──────────────────────────────────────────────────────── */

  async function previewCode(
    rule: CodingRule,
    ctx: AllocationContext,
    sampleSequence?: number
  ): Promise<string> {
    const tokens = parsePattern(rule.pattern);
    const seq = sampleSequence ?? rule.nextSequence;
    return renderCode(tokens, rule, seq, ctx);
  }

  async function allocateCode(
    tenantId: string,
    entityType: string,
    ctx: AllocationContext
  ): Promise<{ code: string; ruleId: string; scopeKey: string }> {
    const rule = await prisma.codingRule.findFirst({
      where: {
        tenantId,
        entityType,
        isActive: true,
        OR: [
          { effectiveFrom: null },
          { effectiveFrom: { lte: new Date() } },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!rule) {
      throw new Error(`NO_CODING_RULE: No active coding rule for ${entityType}`);
    }

    if (ctx.manualCode) {
      if (!rule.isManualOverrideAllowed) {
        throw new Error('MANUAL_OVERRIDE_NOT_ALLOWED');
      }
      const existing = await prisma.codingAllocationLog.findFirst({
        where: { tenantId, entityType, code: ctx.manualCode },
      });
      if (existing) {
        throw new Error('CODE_ALREADY_EXISTS');
      }
      return { code: ctx.manualCode, ruleId: rule.id, scopeKey: 'manual' };
    }

    const tokens = parsePattern(rule.pattern);
    const scopeKey = resolveScopeKey(rule, ctx);
    const seq = await allocateNextSequence(tenantId, entityType, scopeKey);
    const code = renderCode(tokens, rule, seq, ctx);

    // Verify uniqueness (race-condition guard)
    const existing = await prisma.codingAllocationLog.findFirst({
      where: { tenantId, entityType, code },
    });
    if (existing) {
      // Retry once with next sequence
      const seq2 = await allocateNextSequence(tenantId, entityType, scopeKey);
      const code2 = renderCode(tokens, rule, seq2, ctx);
      const existing2 = await prisma.codingAllocationLog.findFirst({
        where: { tenantId, entityType, code: code2 },
      });
      if (existing2) {
        throw new Error('CODE_CONFLICT: Unable to allocate unique code after retry');
      }
      return { code: code2, ruleId: rule.id, scopeKey };
    }

    return { code, ruleId: rule.id, scopeKey };
  }

  async function logAllocation(
    tenantId: string,
    entityType: string,
    entityId: string,
    code: string,
    ruleId: string,
    scopeKey: string,
    actorId: string,
    isManualOverride = false
  ): Promise<CodingAllocationLog> {
    return prisma.codingAllocationLog.create({
      data: {
        tenantId,
        entityType,
        entityId,
        code,
        ruleId,
        scopeKey,
        allocatedBy: actorId,
        isManualOverride,
      },
    });
  }

  /* ─── Coding Rule CRUD ────────────────────────────────────────────────── */

  async function listCodingRules(tenantId: string, entityType?: string): Promise<CodingRule[]> {
    return prisma.codingRule.findMany({
      where: { tenantId, ...(entityType ? { entityType } : {}) },
      orderBy: [{ entityType: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async function getCodingRule(tenantId: string, id: string): Promise<CodingRule | null> {
    return prisma.codingRule.findFirst({
      where: { id, tenantId },
    });
  }

  async function createCodingRule(
    tenantId: string,
    data: Omit<CodingRule, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>
  ): Promise<CodingRule> {
    return prisma.codingRule.create({
      data: { ...data, tenantId },
    });
  }

  async function updateCodingRule(
    tenantId: string,
    id: string,
    data: Partial<Omit<CodingRule, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>>
  ): Promise<CodingRule> {
    return prisma.codingRule.update({
      where: { id_tenantId: { id, tenantId } },
      data,
    });
  }

  async function activateCodingRule(
    tenantId: string,
    id: string,
    effectiveFrom?: Date
  ): Promise<CodingRule> {
    return prisma.codingRule.update({
      where: { id_tenantId: { id, tenantId } },
      data: { isActive: true, effectiveFrom: effectiveFrom ?? new Date() },
    });
  }

  return {
    previewCode,
    allocateCode,
    logAllocation,
    listCodingRules,
    getCodingRule,
    createCodingRule,
    updateCodingRule,
    activateCodingRule,
  };
}
