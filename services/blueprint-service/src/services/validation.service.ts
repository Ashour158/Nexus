import type { UpsertValidationRuleInput, ValidateTransitionInput } from '@nexus/validation';
import type { BlueprintPrisma } from '../prisma.js';
import { alsStore } from '../request-context.js';

type Rule = {
  type: 'required_field' | 'min_value' | 'activity_completed' | 'contact_linked';
  field?: string;
  minValue?: number;
  activityType?: string;
  errorMessage: string;
};

function getSnapshotField(snapshot: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let cur: unknown = snapshot;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function evalRule(rule: Rule, snapshot: Record<string, unknown>): string | null {
  switch (rule.type) {
    case 'required_field': {
      if (!rule.field) return rule.errorMessage;
      const v = getSnapshotField(snapshot, rule.field);
      if (v === undefined || v === null || v === '') return rule.errorMessage;
      return null;
    }
    case 'min_value': {
      if (!rule.field || rule.minValue === undefined) return rule.errorMessage;
      const raw = getSnapshotField(snapshot, rule.field);
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n) || n < rule.minValue) return rule.errorMessage;
      return null;
    }
    case 'activity_completed': {
      const types = snapshot.completedActivityTypes;
      const want = rule.activityType;
      if (!want) return rule.errorMessage;
      if (Array.isArray(types) && types.includes(want)) return null;
      const acts = snapshot.activities;
      if (Array.isArray(acts)) {
        const ok = acts.some(
          (a) =>
            typeof a === 'object' &&
            a !== null &&
            (a as Record<string, unknown>).type === want &&
            (a as Record<string, unknown>).completed === true
        );
        if (ok) return null;
      }
      return rule.errorMessage;
    }
    case 'contact_linked': {
      if (snapshot.contactId) return null;
      const linked = snapshot.linkedContacts;
      if (Array.isArray(linked) && linked.length > 0) return null;
      return rule.errorMessage;
    }
    default:
      return rule.errorMessage;
  }
}

export function createValidationService(prisma: BlueprintPrisma) {
  return {
    async upsertRule(input: UpsertValidationRuleInput) {
      const existing = await prisma.stageTransitionRule.findFirst({
        where: {
          pipelineId: input.pipelineId,
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
        },
      });
      const rulesJson = input.rules as unknown as object;
      if (existing) {
        return prisma.stageTransitionRule.update({
          where: { id: existing.id },
          data: { rules: rulesJson, version: { increment: 1 } },
        });
      }
      const tid = alsStore.get('tenantId') as string;
      return prisma.stageTransitionRule.create({
        data: {
          tenantId: tid,
          pipelineId: input.pipelineId,
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
          rules: rulesJson,
        },
      });
    },

    async listRules(pipelineId: string) {
      return prisma.stageTransitionRule.findMany({
        where: { pipelineId },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async validateTransition(input: ValidateTransitionInput): Promise<{
      valid: boolean;
      errors: string[];
    }> {
      const row = await prisma.stageTransitionRule.findFirst({
        where: {
          pipelineId: input.pipelineId,
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
        },
      });
      if (!row) {
        return { valid: true, errors: [] };
      }
      const rules = row.rules as unknown as Rule[];
      if (!Array.isArray(rules)) {
        return { valid: true, errors: [] };
      }
      const errors: string[] = [];
      for (const r of rules) {
        const msg = evalRule(r, input.dealSnapshot);
        if (msg) errors.push(msg);
      }
      return { valid: errors.length === 0, errors };
    },
  };
}
