import type { PaginatedResult } from '@nexus/shared-types';
import { BusinessRuleError, NotFoundError, createCodingClient } from '@nexus/service-utils';

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
  const where: Prisma.DealWhereInput = { tenantId };
  if (filters.status) where.status = filters.status;
  else where.status = { not: 'DORMANT' };
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

export function createDealsService(prisma: DealsPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Deal> {
    const row = await prisma.deal.findFirst({ where: { id, tenantId } });
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
      if (existing.status === 'DORMANT') return;
      const customFields = (existing.customFields as Record<string, unknown> | null) ?? {};
      await prisma.deal.update({
        where: { id },
        data: { status: 'DORMANT', customFields: { ...customFields, _deletedAt: new Date().toISOString() } as Prisma.InputJsonValue, version: { increment: 1 } },
      });
    },

    async moveDealToStage(tenantId: string, id: string, stageId: string): Promise<Deal> {
      const existing = await loadOrThrow(tenantId, id);
      const stage = await prisma.stage.findFirst({ where: { id: stageId, tenantId } });
      if (!stage) throw new NotFoundError('Stage', stageId);
      if (stage.pipelineId !== existing.pipelineId) throw new BusinessRuleError('Target stage does not belong to the deal pipeline');
      if (existing.stageId === stageId) return existing;
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
  };
}

export type DealsService = ReturnType<typeof createDealsService>;
