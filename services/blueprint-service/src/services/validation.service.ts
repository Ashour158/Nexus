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

/**
 * Evaluate the EXIT criteria of the stage a deal is leaving (`fromStageId`).
 *
 * Looks up the matching `PlaybookStage` (by tenant + `stageId`, narrowed by
 * pipeline when possible), then evaluates:
 *   - `exitCriteria` — an array of {@link Rule} objects, same shape/vocabulary
 *     as StageTransitionRule rules, run through {@link evalRule}.
 *   - `requiredFields` — a `string[]`; each is treated as an implicit
 *     `required_field` rule that must be present & non-empty in the snapshot.
 *
 * Returns the list of error messages for any unmet criteria (empty = all met).
 */
async function evalStageExitCriteria(
  prisma: BlueprintPrisma,
  input: ValidateTransitionInput
): Promise<string[]> {
  const tenantId = alsStore.get('tenantId') as string | undefined;
  const stage = await prisma.playbookStage.findFirst({
    where: {
      stageId: input.fromStageId,
      ...(tenantId ? { tenantId } : {}),
      playbook: { pipelineId: input.pipelineId, isActive: true },
    },
  });
  if (!stage) return [];

  const errors: string[] = [];

  const exitCriteria = stage.exitCriteria as unknown;
  if (Array.isArray(exitCriteria)) {
    for (const raw of exitCriteria) {
      if (!raw || typeof raw !== 'object') continue;
      const rule = raw as Rule;
      const msg = evalRule(rule, input.dealSnapshot);
      if (msg) errors.push(msg);
    }
  }

  const requiredFields = stage.requiredFields;
  if (Array.isArray(requiredFields)) {
    for (const field of requiredFields) {
      if (typeof field !== 'string' || field.length === 0) continue;
      const msg = evalRule(
        {
          type: 'required_field',
          field,
          errorMessage: `Field "${field}" is required to exit this stage.`,
        },
        input.dealSnapshot
      );
      if (msg) errors.push(msg);
    }
  }

  return errors;
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
      const errors: string[] = [];

      // 1) Explicit StageTransitionRule rules (unchanged existing behaviour).
      const row = await prisma.stageTransitionRule.findFirst({
        where: {
          pipelineId: input.pipelineId,
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
        },
      });
      if (row) {
        const rules = row.rules as unknown as Rule[];
        if (Array.isArray(rules)) {
          for (const r of rules) {
            const msg = evalRule(r, input.dealSnapshot);
            if (msg) errors.push(msg);
          }
        }
      }

      // 2) Playbook stage EXIT criteria — a stage may block its own exit until
      //    its `exitCriteria` (Rule[]) and `requiredFields` (string[]) are met.
      //    This is additive: absence of a playbook stage leaves the result
      //    exactly as the StageTransitionRule path produced it. Guarded so a
      //    lookup failure degrades to "no extra criteria" rather than throwing.
      try {
        const exitErrors = await evalStageExitCriteria(prisma, input);
        errors.push(...exitErrors);
      } catch {
        /* ignore — do not let exit-criteria enrichment break validation */
      }

      return { valid: errors.length === 0, errors };
    },
  };
}
