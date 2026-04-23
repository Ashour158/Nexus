import { Decimal } from 'decimal.js';
import type { PaginatedResult } from '@nexus/shared-types';
import {
  BusinessRuleError,
  NotFoundError,
} from '@nexus/service-utils';
import type {
  CommissionListQuery,
  CommissionSummaryQuery,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type {
  CommissionPlan,
  CommissionRecord,
  CommissionStatus,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Denormalized plan rules parsed from `CommissionPlan.rules` JSON. */
export interface PlanRules {
  baseRate: number;
  acceleratorThreshold?: number;
  acceleratorMultiplier?: number;
  clawbackRate?: number;
}

/** SPIFF entries parsed from `CommissionPlan.spiffs` JSON. */
export interface SpiffRule {
  name: string;
  amount: number;
  /** Flat bonus amount added when the match conditions all pass. */
  pipelineId?: string;
  productId?: string;
  /** Optional minimum deal amount. */
  minDealAmount?: number;
}

export interface CalculateCommissionDeal {
  amount: number;
  ownerId: string;
  pipelineId: string;
  /** Optional catalog context for SPIFF matching. */
  productIds?: string[];
}

export interface CommissionResult {
  base: number;
  acceleratorBonus: number;
  spiff: number;
  clawbackRisk: number;
  total: number;
  breakdown: string[];
}

export interface RecordCommissionContext {
  amount: number;
  currency: string;
  pipelineId: string;
  productIds?: string[];
}

export interface CommissionSummary {
  total: number;
  paid: number;
  pending: number;
  clawbacks: number;
  acceleratorBonus: number;
}

type CommissionListFilters = Omit<
  CommissionListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

interface ListPagination {
  page: number;
  limit: number;
  sortDir: 'asc' | 'desc';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parsePlanRules(raw: Prisma.JsonValue | null | undefined): PlanRules {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      baseRate: typeof obj.baseRate === 'number' ? obj.baseRate : 0,
      acceleratorThreshold:
        typeof obj.acceleratorThreshold === 'number'
          ? obj.acceleratorThreshold
          : undefined,
      acceleratorMultiplier:
        typeof obj.acceleratorMultiplier === 'number'
          ? obj.acceleratorMultiplier
          : undefined,
      clawbackRate:
        typeof obj.clawbackRate === 'number' ? obj.clawbackRate : undefined,
    };
  }
  // Fallback: if `rules` is an array, look for the first object with `baseRate`.
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.baseRate === 'number') {
          return parsePlanRules(obj as Prisma.JsonObject);
        }
      }
    }
  }
  return { baseRate: 0 };
}

function parseSpiffs(raw: Prisma.JsonValue | null | undefined): SpiffRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: SpiffRule[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : undefined;
    const amount = typeof obj.amount === 'number' ? obj.amount : undefined;
    if (!name || amount === undefined) continue;
    rules.push({
      name,
      amount,
      pipelineId:
        typeof obj.pipelineId === 'string' ? obj.pipelineId : undefined,
      productId:
        typeof obj.productId === 'string' ? obj.productId : undefined,
      minDealAmount:
        typeof obj.minDealAmount === 'number' ? obj.minDealAmount : undefined,
    });
  }
  return rules;
}

function periodForDate(d: Date): string {
  const year = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${quarter}-${year}`;
}

function periodFilter(period: { year: number; quarter?: number }): string[] {
  if (period.quarter) return [`Q${period.quarter}-${period.year}`];
  return [1, 2, 3, 4].map((q) => `Q${q}-${period.year}`);
}

function buildListWhere(
  tenantId: string,
  f: CommissionListFilters
): Prisma.CommissionRecordWhereInput {
  const where: Prisma.CommissionRecordWhereInput = { tenantId };
  if (f.ownerId) where.userId = f.ownerId;
  if (f.userId) where.userId = f.userId;
  if (f.status) where.status = f.status;
  if (f.dateFrom || f.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (f.dateFrom) range.gte = new Date(f.dateFrom);
    if (f.dateTo) range.lte = new Date(f.dateTo);
    where.createdAt = range;
  }
  return where;
}

function decimalToNumber(d: Prisma.Decimal): number {
  return Number(d.toFixed(2));
}

// ─── Service Factory ────────────────────────────────────────────────────────

/**
 * Commission service (Section 41). Calculates accelerator bonuses, SPIFFs
 * and clawback risk, persists immutable `CommissionRecord` rows with an
 * explicit approval workflow, and aggregates summaries for statements.
 */
export function createCommissionService(
  prisma: FinancePrisma,
  producer: NexusProducer
) {
  /**
   * Pure calculator. Does not touch the database; callers hydrate the plan
   * via `prisma.commissionPlan.findFirst(...)` and pass it in.
   */
  function calculateCommission(
    deal: CalculateCommissionDeal,
    plan: CommissionPlan
  ): CommissionResult {
    const breakdown: string[] = [];
    const rules = parsePlanRules(plan.rules);
    const spiffRules = parseSpiffs(plan.spiffs);

    const dealAmount = new Decimal(deal.amount);
    const baseRate = new Decimal(rules.baseRate);
    const base = dealAmount.times(baseRate);
    breakdown.push(
      `Base: ${dealAmount.toFixed(2)} × ${baseRate.toFixed(4)} = ${base.toFixed(2)}`
    );

    let acceleratorBonus = new Decimal(0);
    if (
      rules.acceleratorThreshold !== undefined &&
      rules.acceleratorMultiplier !== undefined &&
      dealAmount.gte(rules.acceleratorThreshold)
    ) {
      const acceleratedBase = base.times(rules.acceleratorMultiplier);
      acceleratorBonus = acceleratedBase.minus(base);
      breakdown.push(
        `Accelerator: deal ≥ ${rules.acceleratorThreshold} → bonus ${acceleratorBonus.toFixed(
          2
        )} (×${rules.acceleratorMultiplier})`
      );
    }

    let spiff = new Decimal(0);
    for (const rule of spiffRules) {
      if (rule.pipelineId && rule.pipelineId !== deal.pipelineId) continue;
      if (
        rule.productId &&
        !(deal.productIds ?? []).includes(rule.productId)
      ) {
        continue;
      }
      if (
        rule.minDealAmount !== undefined &&
        dealAmount.lt(rule.minDealAmount)
      ) {
        continue;
      }
      spiff = spiff.plus(rule.amount);
      breakdown.push(`SPIFF "${rule.name}": +${rule.amount.toFixed(2)}`);
    }

    const clawbackRate = new Decimal(rules.clawbackRate ?? 0);
    const clawbackRisk = base.times(clawbackRate);
    if (clawbackRate.gt(0)) {
      breakdown.push(
        `Clawback risk (informational): ${clawbackRisk.toFixed(2)} @ ${clawbackRate.toFixed(4)}`
      );
    }

    const total = base.plus(acceleratorBonus).plus(spiff);
    breakdown.push(`Total: ${total.toFixed(2)}`);

    return {
      base: Number(base.toFixed(2)),
      acceleratorBonus: Number(acceleratorBonus.toFixed(2)),
      spiff: Number(spiff.toFixed(2)),
      clawbackRisk: Number(clawbackRisk.toFixed(2)),
      total: Number(total.toFixed(2)),
      breakdown,
    };
  }

  async function loadRecordOrThrow(
    tenantId: string,
    id: string
  ): Promise<CommissionRecord> {
    const row = await prisma.commissionRecord.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundError('CommissionRecord', id);
    return row;
  }

  async function findActivePlanForUser(
    tenantId: string,
    userId: string,
    when: Date
  ): Promise<CommissionPlan> {
    const assignment = await prisma.commissionAssignment.findFirst({
      where: {
        tenantId,
        userId,
        startDate: { lte: when },
        OR: [{ endDate: null }, { endDate: { gte: when } }],
      },
      orderBy: { startDate: 'desc' },
    });
    if (!assignment) {
      throw new NotFoundError('CommissionAssignment', `user:${userId}`);
    }
    const plan = await prisma.commissionPlan.findFirst({
      where: { id: assignment.planId, tenantId, isActive: true },
    });
    if (!plan) {
      throw new NotFoundError('CommissionPlan', assignment.planId);
    }
    return plan;
  }

  return {
    calculateCommission,

    /**
     * Calculates and persists a commission record for a won deal. The deal
     * context must be supplied by the caller (typically the `deal.won`
     * Kafka consumer) because the finance service does not have direct
     * access to the CRM Deal table. Returns the persisted record.
     */
    async recordCommission(
      tenantId: string,
      dealId: string,
      ownerId: string,
      dealContext: RecordCommissionContext
    ): Promise<CommissionRecord> {
      const now = new Date();
      const plan = await findActivePlanForUser(tenantId, ownerId, now);
      const result = calculateCommission(
        {
          amount: dealContext.amount,
          ownerId,
          pipelineId: dealContext.pipelineId,
          productIds: dealContext.productIds,
        },
        plan
      );

      const planRules = parsePlanRules(plan.rules);
      const multiplier =
        planRules.acceleratorMultiplier !== undefined &&
        dealContext.amount >= (planRules.acceleratorThreshold ?? Infinity)
          ? planRules.acceleratorMultiplier
          : 1;

      const created = await prisma.commissionRecord.create({
        data: {
          tenantId,
          userId: ownerId,
          planId: plan.id,
          dealId,
          type: 'DEAL_CLOSED',
          status: 'PENDING',
          baseAmount: new Prisma.Decimal(result.base),
          rate: planRules.baseRate,
          amount: new Prisma.Decimal(result.base + result.spiff),
          multiplier,
          finalAmount: new Prisma.Decimal(result.total),
          period: periodForDate(now),
          breakdown: result.breakdown as unknown as Prisma.InputJsonValue,
        },
      });

      await producer
        .publish(TOPICS.COMMISSIONS, {
          type: 'commission.calculated',
          tenantId,
          payload: {
            commissionId: created.id,
            userId: created.userId,
            dealId,
            baseAmount: result.base,
            finalAmount: result.total,
            currency: dealContext.currency,
          },
        })
        .catch(() => undefined);

      return created;
    },

    async approveCommission(
      tenantId: string,
      commissionId: string,
      approverId: string
    ): Promise<CommissionRecord> {
      const existing = await loadRecordOrThrow(tenantId, commissionId);
      if (existing.status !== 'PENDING') {
        throw new BusinessRuleError(
          `Only PENDING commissions can be approved (current: ${existing.status})`
        );
      }
      const updated = await prisma.commissionRecord.update({
        where: { id: commissionId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: approverId,
        },
      });

      await producer
        .publish(TOPICS.COMMISSIONS, {
          type: 'commission.approved',
          tenantId,
          payload: {
            commissionId: updated.id,
            userId: updated.userId,
            finalAmount: decimalToNumber(updated.finalAmount),
          },
        })
        .catch(() => undefined);

      return updated;
    },

    /**
     * Clawback — per spec, only PAID commissions can be clawed back.
     * Flips status to `CLAWED_BACK` and records the reason.
     */
    async clawbackCommission(
      tenantId: string,
      commissionId: string,
      reason: string
    ): Promise<CommissionRecord> {
      const existing = await loadRecordOrThrow(tenantId, commissionId);
      if (existing.status !== 'PAID') {
        throw new BusinessRuleError(
          `Only PAID commissions can be clawed back (current: ${existing.status})`
        );
      }
      const updated = await prisma.commissionRecord.update({
        where: { id: commissionId },
        data: {
          status: 'CLAWED_BACK',
          clawbackReason: reason,
        },
      });

      await producer
        .publish(TOPICS.COMMISSIONS, {
          type: 'commission.clawback',
          tenantId,
          payload: {
            commissionId: updated.id,
            userId: updated.userId,
            originalAmount: decimalToNumber(updated.finalAmount),
            reason,
          },
        })
        .catch(() => undefined);

      return updated;
    },

    async listCommissions(
      tenantId: string,
      filters: CommissionListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<CommissionRecord>> {
      const where = buildListWhere(tenantId, filters);
      const { page, limit, sortDir } = pagination;
      const [total, rows] = await Promise.all([
        prisma.commissionRecord.count({ where }),
        prisma.commissionRecord.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: sortDir },
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async getCommissionForDeal(
      tenantId: string,
      dealId: string
    ): Promise<CommissionRecord | null> {
      return prisma.commissionRecord.findFirst({
        where: { tenantId, dealId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getCommissionSummary(
      tenantId: string,
      ownerId: string,
      period: Omit<CommissionSummaryQuery, 'ownerId'>
    ): Promise<CommissionSummary> {
      const periods = periodFilter(period);
      const rows = await prisma.commissionRecord.findMany({
        where: { tenantId, userId: ownerId, period: { in: periods } },
        select: {
          status: true,
          baseAmount: true,
          finalAmount: true,
          multiplier: true,
        },
      });

      let total = new Decimal(0);
      let paid = new Decimal(0);
      let pending = new Decimal(0);
      let clawbacks = new Decimal(0);
      let acceleratorBonus = new Decimal(0);

      for (const r of rows) {
        const finalAmt = new Decimal(r.finalAmount.toString());
        const baseAmt = new Decimal(r.baseAmount.toString());
        const multiplier = new Decimal(r.multiplier ?? 1);
        total = total.plus(finalAmt);
        if (r.status === 'PAID') paid = paid.plus(finalAmt);
        if (r.status === 'PENDING') pending = pending.plus(finalAmt);
        if (r.status === 'CLAWED_BACK') {
          clawbacks = clawbacks.plus(finalAmt);
        }
        if (multiplier.gt(1)) {
          const accel = baseAmt.times(multiplier).minus(baseAmt);
          acceleratorBonus = acceleratorBonus.plus(accel);
        }
      }

      return {
        total: Number(total.toFixed(2)),
        paid: Number(paid.toFixed(2)),
        pending: Number(pending.toFixed(2)),
        clawbacks: Number(clawbacks.toFixed(2)),
        acceleratorBonus: Number(acceleratorBonus.toFixed(2)),
      };
    },
  };
}

export type CommissionService = ReturnType<typeof createCommissionService>;
export type { CommissionStatus };
