import { NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { ValidationRule } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

function evalPredicate(cond: unknown, payload: Record<string, unknown>): boolean {
  if (!cond || typeof cond !== 'object') return true;
  const c = cond as Record<string, unknown>;
  if (Array.isArray(c.and)) return c.and.every((x) => evalPredicate(x, payload));
  if (Array.isArray(c.or)) return c.or.some((x) => evalPredicate(x, payload));
  if (typeof c.not === 'object' && c.not !== null) return !evalPredicate(c.not, payload);
  const field = typeof c.field === 'string' ? c.field : undefined;
  const op = typeof c.op === 'string' ? c.op : undefined;
  const value = c.value;
  if (!field || !op) return true;
  const actual = getPath(payload, field);
  switch (op) {
    case 'eq': return actual === value;
    case 'neq': return actual !== value;
    case 'gt': return Number(actual) > Number(value);
    case 'gte': return Number(actual) >= Number(value);
    case 'lt': return Number(actual) < Number(value);
    case 'lte': return Number(actual) <= Number(value);
    case 'in': return Array.isArray(value) ? value.includes(actual) : false;
    case 'contains': return typeof actual === 'string' && typeof value === 'string' ? actual.toLowerCase().includes(value.toLowerCase()) : false;
    case 'exists': return value ? actual !== undefined && actual !== null : actual == null;
    default: return true;
  }
}

function requirementSatisfied(req: unknown, payload: Record<string, unknown>): boolean {
  if (!req || typeof req !== 'object') return true;
  const r = req as Record<string, unknown>;
  if (Array.isArray(r.requiredFields)) {
    return r.requiredFields.every((f) => {
      if (typeof f !== 'string') return true;
      const v = getPath(payload, f);
      return !(v === undefined || v === null || v === '');
    });
  }
  if (typeof r.field === 'string') {
    const v = getPath(payload, r.field);
    return !(v === undefined || v === null || v === '');
  }
  return true;
}

export function createValidationRulesService(prisma: MetadataPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<ValidationRule> {
    const row = await prisma.validationRule.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('ValidationRule', id);
    return row;
  }

  return {
    async listRules(tenantId: string, objectType?: string): Promise<ValidationRule[]> {
      return prisma.validationRule.findMany({
        where: { tenantId, ...(objectType ? { objectType } : {}) },
        orderBy: { createdAt: 'asc' },
      });
    },

    async getRuleById(tenantId: string, id: string): Promise<ValidationRule> {
      return loadOrThrow(tenantId, id);
    },

    async createRule(tenantId: string, data: { objectType: string; name: string; condition: Record<string, unknown>; requirement: Record<string, unknown>; errorMessage: string }): Promise<ValidationRule> {
      return prisma.validationRule.create({
        data: {
          tenantId,
          objectType: data.objectType,
          name: data.name,
          condition: data.condition as Prisma.InputJsonValue,
          requirement: data.requirement as Prisma.InputJsonValue,
          errorMessage: data.errorMessage,
        },
      });
    },

    async updateRule(tenantId: string, id: string, data: { isActive?: boolean; errorMessage?: string; name?: string; condition?: Record<string, unknown>; requirement?: Record<string, unknown> }): Promise<ValidationRule> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.ValidationRuleUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.errorMessage !== undefined) update.errorMessage = data.errorMessage;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      if (data.condition !== undefined) update.condition = data.condition as Prisma.InputJsonValue;
      if (data.requirement !== undefined) update.requirement = data.requirement as Prisma.InputJsonValue;
      return prisma.validationRule.update({ where: { id }, data: update });
    },

    async deleteRule(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.validationRule.delete({ where: { id } });
    },

    validate(_objectType: string, payload: Record<string, unknown>, rules: ValidationRule[]) {
      const violations = rules
        .filter((rule) => evalPredicate(rule.condition, payload) && !requirementSatisfied(rule.requirement, payload))
        .map((rule) => ({ ruleId: rule.id, ruleName: rule.name, errorMessage: rule.errorMessage }));
      return { valid: violations.length === 0, rulesEvaluated: rules.length, violations };
    },
  };
}

export type ValidationRulesService = ReturnType<typeof createValidationRulesService>;
