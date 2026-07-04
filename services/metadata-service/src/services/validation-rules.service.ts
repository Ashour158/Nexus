import { NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { ValidationRule } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';
import { evaluateRules, type EvaluatorRule } from './validation-evaluator.js';

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

    /**
     * Evaluate a record payload against a set of active ValidationRule rows.
     * Pure + total: delegates to the shared evaluator, which never throws and
     * treats unknown operators / requirement shapes as non-blocking. The result
     * carries both structured `violations` and a flat `errors` list (the latter
     * matches crm-service's validateRecord() contract).
     */
    validate(_objectType: string, payload: Record<string, unknown>, rules: ValidationRule[]) {
      const evaluatorRules: EvaluatorRule[] = rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        errorMessage: rule.errorMessage,
        condition: rule.condition,
        requirement: rule.requirement,
      }));
      return evaluateRules(evaluatorRules, payload);
    },
  };
}

export type ValidationRulesService = ReturnType<typeof createValidationRulesService>;
