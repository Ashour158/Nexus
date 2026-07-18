/**
 * Scoring Rules Engine (WF-DEPTH — Zoho-style configurable record scoring).
 *
 * An admin authors ScoringRule rows per module (lead|deal|contact|account). Each
 * rule carries `conditions` — [{ field, operator, value, points }] — where every
 * MATCHED condition contributes its `points` (positive or negative) to the record's
 * total. The scorer is deterministic and pure: it reuses the exact operator
 * semantics the automation-rule engine uses (`evaluateCondition`), so a condition
 * scores identically whether it gates an automation or a score.
 *
 * The computed total + a per-condition breakdown is materialised into a RecordScore
 * (one row per tenant+module+record) via `recompute`. Recompute happens on demand
 * (`POST /scoring-rules/recompute`) or automatically off record events (the record
 * consumer) — but only when the tenant actually has active scoring rules for the
 * module, so an unconfigured tenant is a pure no-op (today's behaviour).
 */
import { NotFoundError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import {
  evaluateCondition,
  type ConditionOperator,
  type RuleCondition,
} from './automation-rules.service.js';

/** Modules the scoring engine supports. */
export const SCORING_MODULES = ['lead', 'deal', 'contact', 'account'] as const;
export type ScoringModule = (typeof SCORING_MODULES)[number];

/** A single scoring condition: an automation condition plus a point weight. */
export interface ScoringCondition extends RuleCondition {
  points: number;
}

export interface ScoringRuleInput {
  module: string;
  name: string;
  conditions: ScoringCondition[];
  isActive?: boolean;
}

/** One contributing line in a score breakdown. */
export interface ScoreBreakdownEntry {
  ruleId: string;
  ruleName: string;
  field: string;
  operator: string;
  value: unknown;
  points: number;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdownEntry[];
}

interface ScoringRuleRow {
  id: string;
  name: string;
  conditions: unknown;
}

/**
 * Deterministic scorer. Applies every condition of every active rule against the
 * record data; each matched condition adds its (possibly negative) points. Returns
 * the summed score and the ordered breakdown of contributing conditions.
 *
 * Pure — no I/O, no clock. Same inputs ⇒ same output, which is what makes a stored
 * score reproducible and a recompute idempotent.
 */
export function scoreRecord(
  rules: ScoringRuleRow[],
  recordData: Record<string, unknown>
): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let score = 0;

  for (const rule of rules) {
    const conditions = Array.isArray(rule.conditions)
      ? (rule.conditions as ScoringCondition[])
      : [];
    for (const cond of conditions) {
      if (!cond || typeof cond.field !== 'string' || typeof cond.operator !== 'string') continue;
      const points = Number(cond.points);
      if (!Number.isFinite(points)) continue;
      const matched = evaluateCondition(
        { field: cond.field, operator: cond.operator as ConditionOperator, value: cond.value },
        recordData
      );
      if (!matched) continue;
      score += points;
      breakdown.push({
        ruleId: rule.id,
        ruleName: rule.name,
        field: cond.field,
        operator: cond.operator,
        value: cond.value,
        points,
      });
    }
  }

  return { score, breakdown };
}

export function createScoringService(prisma: WorkflowPrisma) {
  return {
    async list(tenantId: string, filters: { module?: string; isActive?: boolean }) {
      return prisma.scoringRule.findMany({
        where: {
          tenantId,
          ...(filters.module ? { module: filters.module } : {}),
          ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    async get(tenantId: string, id: string) {
      const row = await prisma.scoringRule.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Scoring rule not found');
      return row;
    },

    async create(tenantId: string, createdBy: string, data: ScoringRuleInput) {
      return prisma.scoringRule.create({
        data: {
          tenantId,
          createdBy,
          module: data.module,
          name: data.name,
          conditions: (data.conditions ?? []) as object,
          isActive: data.isActive ?? true,
        },
      });
    },

    async update(tenantId: string, id: string, data: Partial<ScoringRuleInput>) {
      await this.get(tenantId, id);
      return prisma.scoringRule.update({
        where: { id },
        data: {
          ...(data.module !== undefined ? { module: data.module } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.conditions !== undefined ? { conditions: data.conditions as object } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
    },

    async remove(tenantId: string, id: string) {
      await this.get(tenantId, id);
      await prisma.scoringRule.delete({ where: { id } });
      return { id };
    },

    async toggle(tenantId: string, id: string) {
      const row = await this.get(tenantId, id);
      return prisma.scoringRule.update({ where: { id }, data: { isActive: !row.isActive } });
    },

    /**
     * Apply all active rules for (tenant, module) against `recordData`, upsert the
     * RecordScore, and return the score + breakdown. When the tenant has NO active
     * rules for the module this is a no-op (returns the current stored score if any,
     * else a zero score) — it never creates an empty RecordScore row, so an
     * unconfigured tenant stays exactly as it is today.
     */
    async recompute(
      tenantId: string,
      module: string,
      recordId: string,
      recordData: Record<string, unknown>
    ): Promise<ScoreResult & { recordId: string; module: string; persisted: boolean }> {
      const rules = await prisma.scoringRule.findMany({
        where: { tenantId, module, isActive: true },
        select: { id: true, name: true, conditions: true },
      });

      if (rules.length === 0) {
        const existing = await prisma.recordScore.findUnique({
          where: { tenantId_module_recordId: { tenantId, module, recordId } },
        });
        return {
          recordId,
          module,
          score: existing?.score ?? 0,
          breakdown: (existing?.breakdown as unknown as ScoreBreakdownEntry[]) ?? [],
          persisted: false,
        };
      }

      const { score, breakdown } = scoreRecord(rules, recordData);
      await prisma.recordScore.upsert({
        where: { tenantId_module_recordId: { tenantId, module, recordId } },
        create: { tenantId, module, recordId, score, breakdown: breakdown as object },
        update: { score, breakdown: breakdown as object },
      });
      return { recordId, module, score, breakdown, persisted: true };
    },

    /** Read the stored score+breakdown for a record (null if never scored). */
    async getScore(tenantId: string, module: string, recordId: string) {
      const row = await prisma.recordScore.findUnique({
        where: { tenantId_module_recordId: { tenantId, module, recordId } },
      });
      if (!row) {
        return { tenantId, module, recordId, score: 0, breakdown: [] as ScoreBreakdownEntry[], scored: false };
      }
      return {
        tenantId,
        module,
        recordId,
        score: row.score,
        breakdown: (row.breakdown as unknown as ScoreBreakdownEntry[]) ?? [],
        scored: true,
        updatedAt: row.updatedAt,
      };
    },

    /** Whether a tenant has any active scoring rules for a module (consumer gate). */
    async hasActiveRules(tenantId: string, module: string): Promise<boolean> {
      const n = await prisma.scoringRule.count({ where: { tenantId, module, isActive: true } });
      return n > 0;
    },
  };
}

export type ScoringService = ReturnType<typeof createScoringService>;
