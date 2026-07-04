import type { PaginatedResult } from '@nexus/shared-types';
import { BusinessRuleError, NotFoundError, ValidationError, createCodingClient } from '@nexus/service-utils';

const codingClient = createCodingClient({ baseURL: process.env.METADATA_SERVICE_URL ?? 'http://localhost:3004' });
import type { CreateDealInput, UpdateDealInput, DealListQuery } from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/deals-client/index.js';
import type { Deal } from '../../../../node_modules/.prisma/deals-client/index.js';
import type { DealsPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';

type DealListFilters = Omit<DealListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'amount' | 'expectedCloseDate';
  sortDir: 'asc' | 'desc';
}

function buildWhere(tenantId: string, filters: DealListFilters): Prisma.DealWhereInput {
  const where: Prisma.DealWhereInput = { tenantId, deletedAt: null };
  if (filters.status) where.status = filters.status;
  if (filters.pipelineId) where.pipelineId = filters.pipelineId;
  if (filters.stageId) where.stageId = filters.stageId;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.search?.trim()) where.name = { contains: filters.search.trim(), mode: 'insensitive' };
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    const amount: Prisma.DecimalFilter = {};
    if (filters.minAmount !== undefined) amount.gte = new Prisma.Decimal(filters.minAmount);
    if (filters.maxAmount !== undefined) amount.lte = new Prisma.Decimal(filters.maxAmount);
    where.amount = amount;
  }
  return where;
}

function resolveSortField(sortBy: ListPagination['sortBy']): keyof Prisma.DealOrderByWithRelationInput {
  switch (sortBy) {
    case 'amount':
    case 'expectedCloseDate':
    case 'updatedAt':
      return sortBy;
    case 'createdAt':
    default:
      return 'createdAt';
  }
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

// ─── Stage-gating (fail-open) ────────────────────────────────────────────────

/**
 * Reads a field off a Deal by name for gating checks. Returns `undefined` for
 * unknown fields so gating treats them as "not populated" rather than throwing.
 */
function readDealField(deal: Deal, field: string): unknown {
  return (deal as unknown as Record<string, unknown>)[field];
}

/** A value counts as "present" for a required-field check when it is non-nullish and non-empty. */
function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Prisma.Decimal) return true;
  return true;
}

interface StageCriteria {
  requiredFields: unknown;
  entryConditions: unknown;
}

interface EntryCondition {
  field: string;
  operator?: string;
  value?: unknown;
}

function toEntryConditions(raw: unknown): EntryCondition[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is EntryCondition =>
      typeof c === 'object' && c !== null && typeof (c as { field?: unknown }).field === 'string'
  );
}

/** Evaluate a single entry condition against a deal. Unknown operators fail-open (pass). */
function evaluateCondition(deal: Deal, cond: EntryCondition): boolean {
  const actualRaw = readDealField(deal, cond.field);
  const actual = actualRaw instanceof Prisma.Decimal ? Number(actualRaw) : actualRaw;
  const expected = cond.value;
  switch ((cond.operator ?? 'exists').toLowerCase()) {
    case 'exists':
    case 'is_set':
      return isPresent(actual);
    case 'eq':
    case 'equals':
    case '==':
      return actual === expected;
    case 'neq':
    case '!=':
      return actual !== expected;
    case 'gt':
    case '>':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
    case '>=':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
    case '<':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
    case '<=':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    default:
      // Unknown operator → fail-open so a misconfigured stage never blocks moves.
      return true;
  }
}

/**
 * Evaluate a target stage's gating criteria against a deal.
 *
 * FAIL-OPEN: a stage with no `requiredFields` and no `entryConditions` always
 * passes (`{ ok: true }`), so existing moves behave exactly as before. Only a
 * stage that has been explicitly configured with criteria can block a move.
 */
function evaluateStageGating(deal: Deal, stage: StageCriteria): { ok: true } | { ok: false; missing: string[]; unmet: string[] } {
  const requiredFields = Array.isArray(stage.requiredFields)
    ? stage.requiredFields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    : [];
  const conditions = toEntryConditions(stage.entryConditions);

  const missing = requiredFields.filter((field) => !isPresent(readDealField(deal, field)));
  const unmet = conditions
    .filter((cond) => !evaluateCondition(deal, cond))
    .map((cond) => `${cond.field} ${cond.operator ?? 'exists'}${cond.value !== undefined ? ` ${JSON.stringify(cond.value)}` : ''}`);

  if (missing.length === 0 && unmet.length === 0) return { ok: true };
  return { ok: false, missing, unmet };
}

export function createDealsService(prisma: DealsPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Deal> {
    const row = await prisma.deal.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) throw new NotFoundError('Deal', id);
    return row;
  }

  return {
    async listDeals(tenantId: string, filters: DealListFilters, pagination: ListPagination): Promise<PaginatedResult<Deal>> {
      const where = buildWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.DealOrderByWithRelationInput = { [sortField]: pagination.sortDir };
      const [total, rows] = await Promise.all([
        prisma.deal.count({ where }),
        prisma.deal.findMany({
    where, skip: (pagination.page - 1) * pagination.limit, take: pagination.limit, orderBy }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getDealById(tenantId: string, id: string): Promise<Deal> {
      return loadOrThrow(tenantId, id);
    },

    async createDeal(tenantId: string, data: CreateDealInput): Promise<Deal> {
      const pipeline = await prisma.pipeline.findFirst({ where: { id: data.pipelineId, tenantId } });
      const stage = await prisma.stage.findFirst({ where: { id: data.stageId, tenantId } });
      if (!pipeline) throw new NotFoundError('Pipeline', data.pipelineId);
      if (!stage) throw new NotFoundError('Stage', data.stageId);
      if (stage.pipelineId !== pipeline.id) throw new BusinessRuleError('Stage does not belong to the given pipeline');

      const probability = data.probability ?? stage.probability;
      const code = await codingClient.allocateCode(tenantId, 'DEAL', { ownerId: data.ownerId });
      const created = await prisma.deal.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          accountId: data.accountId,
          code,
          pipelineId: data.pipelineId,
          stageId: data.stageId,
          name: data.name,
          amount: new Prisma.Decimal(data.amount ?? 0),
          currency: data.currency ?? 'USD',
          probability,
          expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
          source: data.source ?? null,
          campaignId: data.campaignId ?? null,
          customFields: data.customFields as Prisma.InputJsonValue,
          tags: data.tags,
        },
      });
      await producer.publish(TOPICS.DEALS, {
        type: 'deal.created',
        tenantId,
        payload: { dealId: created.id, ownerId: created.ownerId, accountId: created.accountId, amount: decimalToNumber(created.amount), currency: created.currency, pipelineId: created.pipelineId, stageId: created.stageId },
      }).catch(() => undefined);
      return created;
    },

    async updateDeal(tenantId: string, id: string, data: UpdateDealInput): Promise<Deal> {
      const existing = await loadOrThrow(tenantId, id);
      const targetPipelineId = data.pipelineId ?? existing.pipelineId;
      const targetStageId = data.stageId ?? existing.stageId;
      if (data.pipelineId || data.stageId) {
        const [pipeline, stage] = await Promise.all([
          prisma.pipeline.findFirst({ where: { id: targetPipelineId, tenantId } }),
          prisma.stage.findFirst({ where: { id: targetStageId, tenantId } }),
        ]);
        if (!pipeline) throw new NotFoundError('Pipeline', targetPipelineId);
        if (!stage) throw new NotFoundError('Stage', targetStageId);
        if (stage.pipelineId !== pipeline.id) throw new BusinessRuleError('Stage does not belong to the given pipeline');
      }
      const updateData: Prisma.DealUpdateInput = { version: { increment: 1 } };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.amount !== undefined) updateData.amount = new Prisma.Decimal(data.amount);
      if (data.currency !== undefined) updateData.currency = data.currency;
      if (data.probability !== undefined) updateData.probability = data.probability;
      if (data.expectedCloseDate !== undefined) updateData.expectedCloseDate = data.expectedCloseDate ? new Date(data.expectedCloseDate) : null;
      if (data.source !== undefined) updateData.source = data.source;
      if (data.campaignId !== undefined) updateData.campaignId = data.campaignId;
      if (data.customFields !== undefined) updateData.customFields = data.customFields as Prisma.InputJsonValue;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.lostReason !== undefined) updateData.lostReason = data.lostReason;
      if (data.closeReason !== undefined) updateData.closeReason = data.closeReason;
      if (data.forecastCategory !== undefined) updateData.forecastCategory = data.forecastCategory;
      if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;
      if (data.accountId !== undefined) updateData.accountId = data.accountId;
      if (data.pipelineId !== undefined) updateData.pipeline = { connect: { id: data.pipelineId } };
      if (data.stageId !== undefined) updateData.stage = { connect: { id: data.stageId } };
      return prisma.deal.update({ where: { id }, data: updateData });
    },

    async deleteDeal(tenantId: string, id: string): Promise<void> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.deletedAt) return;
      await prisma.deal.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DORMANT', version: { increment: 1 } },
      });
    },

    async moveDealToStage(tenantId: string, id: string, stageId: string): Promise<Deal> {
      const existing = await loadOrThrow(tenantId, id);
      const stage = await prisma.stage.findFirst({ where: { id: stageId, tenantId } });
      if (!stage) throw new NotFoundError('Stage', stageId);
      if (stage.pipelineId !== existing.pipelineId) throw new BusinessRuleError('Target stage does not belong to the deal pipeline');
      if (existing.stageId === stageId) return existing;

      // Stage-gating enforcement (fail-open). A stage with no requiredFields /
      // entryConditions always passes, so moves behave exactly as before.
      const gate = evaluateStageGating(existing, {
        requiredFields: stage.requiredFields,
        entryConditions: stage.entryConditions,
      });
      if (!gate.ok) {
        throw new ValidationError('Deal does not meet the target stage entry criteria', {
          stageId: stage.id,
          stageName: stage.name,
          missingRequiredFields: gate.missing,
          unmetEntryConditions: gate.unmet,
        });
      }

      const updated = await prisma.deal.update({ where: { id }, data: { stageId, probability: stage.probability, version: { increment: 1 } } });
      await producer.publish(TOPICS.DEALS, {
        type: 'deal.stage_changed',
        tenantId,
        payload: {
          dealId: updated.id,
          previousStageId: existing.stageId,
          newStageId: stage.id,
          ownerId: updated.ownerId,
          amount: decimalToNumber(updated.amount),
          rottenDays: stage.rottenDays,
          stageChangedAt: new Date().toISOString(),
        },
      }).catch(() => undefined);
      return updated;
    },

    /**
     * Forecast roll-up for open deals, grouped by `forecastCategory`.
     * Returns, per category: total `amount` and weighted amount
     * (`amount * probability / 100`), plus a grand total weighted pipeline.
     * Tenant-scoped; only OPEN deals (not deleted) are counted.
     */
    async getForecast(tenantId: string): Promise<{
      categories: Array<{ forecastCategory: string; dealCount: number; amount: number; weightedAmount: number }>;
      totalAmount: number;
      totalWeightedPipeline: number;
    }> {
      const rows = await prisma.deal.findMany({
        where: { tenantId, deletedAt: null, status: 'OPEN' },
        select: { forecastCategory: true, amount: true, probability: true },
      });

      const byCategory = new Map<string, { dealCount: number; amount: number; weightedAmount: number }>();
      let totalAmount = 0;
      let totalWeightedPipeline = 0;

      for (const row of rows) {
        const amount = decimalToNumber(row.amount);
        const weighted = Number(((amount * (row.probability ?? 0)) / 100).toFixed(2));
        const key = String(row.forecastCategory);
        const acc = byCategory.get(key) ?? { dealCount: 0, amount: 0, weightedAmount: 0 };
        acc.dealCount += 1;
        acc.amount = Number((acc.amount + amount).toFixed(2));
        acc.weightedAmount = Number((acc.weightedAmount + weighted).toFixed(2));
        byCategory.set(key, acc);
        totalAmount = Number((totalAmount + amount).toFixed(2));
        totalWeightedPipeline = Number((totalWeightedPipeline + weighted).toFixed(2));
      }

      const categories = Array.from(byCategory.entries())
        .map(([forecastCategory, v]) => ({ forecastCategory, ...v }))
        .sort((a, b) => b.weightedAmount - a.weightedAmount);

      return { categories, totalAmount, totalWeightedPipeline };
    },

    /**
     * One pass of the rotten-deal scan. Finds OPEN deals across all tenants
     * whose time in the current stage exceeds that stage's `rottenDays`, and
     * emits a `deal.rotten` event per deal. Idempotency/dedup is deferred to
     * consumers. Never hard-fails: individual publish errors are swallowed and
     * the whole pass is safe to call repeatedly.
     */
    async scanRottenDeals(now: Date = new Date()): Promise<{ scanned: number; rotten: number }> {
      // Consider deals not touched since the max possible rotten window. We
      // then confirm per-deal against its own stage's rottenDays below.
      const candidates = await prisma.deal.findMany({
        where: { deletedAt: null, status: 'OPEN' },
        select: {
          id: true,
          tenantId: true,
          ownerId: true,
          amount: true,
          stageId: true,
          updatedAt: true,
          stage: { select: { rottenDays: true, name: true } },
        },
        take: 5000,
      });

      let rotten = 0;
      for (const deal of candidates) {
        const rottenDays = deal.stage?.rottenDays ?? 0;
        if (!rottenDays || rottenDays <= 0) continue;
        const idleMs = now.getTime() - new Date(deal.updatedAt).getTime();
        const idleDays = idleMs / 86_400_000;
        if (idleDays < rottenDays) continue;
        rotten += 1;
        await producer
          .publish(TOPICS.DEALS, {
            type: 'deal.rotten',
            tenantId: deal.tenantId,
            payload: {
              dealId: deal.id,
              ownerId: deal.ownerId,
              stageId: deal.stageId,
              stageName: deal.stage?.name ?? null,
              amount: decimalToNumber(deal.amount),
              rottenDays,
              idleDays: Math.floor(idleDays),
              detectedAt: now.toISOString(),
            },
          })
          .catch(() => undefined);
      }
      return { scanned: candidates.length, rotten };
    },
  };
}

export type DealsService = ReturnType<typeof createDealsService>;
