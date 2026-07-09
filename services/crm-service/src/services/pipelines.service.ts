import { BusinessRuleError, ConflictError, NotFoundError } from '@nexus/service-utils';
import type {
  CreatePipelineInput,
  CreateStageInput,
  UpdatePipelineInput,
  UpdateStageInput,
} from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type {
  Pipeline,
  Stage,
} from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';

export type PipelineWithStages = Prisma.PipelineGetPayload<{
  include: { stages: true; _count: { select: { deals: true } } };
}>;

function orderedStages(stages: Stage[]): Stage[] {
  return [...stages].sort((a, b) => a.order - b.order);
}

export function createPipelinesService(prisma: CrmPrisma) {
  async function loadPipelineOrThrow(tenantId: string, id: string): Promise<Pipeline> {
    const row = await prisma.pipeline.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Pipeline', id);
    return row;
  }

  async function loadPipelineWithStagesOrThrow(
    tenantId: string,
    id: string
  ): Promise<PipelineWithStages> {
    const row = await prisma.pipeline.findFirst({
      where: { id, tenantId },
      include: {
        stages: true,
        _count: { select: { deals: true } },
      },
    });
    if (!row) throw new NotFoundError('Pipeline', id);
    row.stages = orderedStages(row.stages).map((s) => ({ ...s, position: s.order }));
    return row as PipelineWithStages;
  }

  return {
    async listPipelines(tenantId: string): Promise<PipelineWithStages[]> {
      const rows = await prisma.pipeline.findMany({
        where: { tenantId, isActive: true },
        include: {
          stages: true,
          _count: { select: { deals: true } },
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      return rows.map((p) => ({
        ...p,
        stages: orderedStages(p.stages).map((s) => ({ ...s, position: s.order })),
      }));
    },

    async getPipelineById(tenantId: string, id: string): Promise<PipelineWithStages> {
      return loadPipelineWithStagesOrThrow(tenantId, id);
    },

    async createPipeline(
      tenantId: string,
      data: CreatePipelineInput
    ): Promise<PipelineWithStages> {
      const existing = await prisma.pipeline.findFirst({
        where: { tenantId, name: data.name },
      });
      if (existing) throw new ConflictError('Pipeline', 'name');

      const created = await prisma.$transaction(async (tx) => {
        if (data.isDefault) {
          await tx.pipeline.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.pipeline.create({
          data: {
            tenantId,
            name: data.name,
            type: data.type ?? 'sales',
            description: data.description,
            ownedBy: data.ownedBy,
            currency: data.currency,
            isDefault: data.isDefault,
            isActive: data.isActive,
            stages: {
              create: data.stages.map((s, idx) => ({
                tenantId,
                name: s.name,
                order: s.order ?? s.position ?? idx,
                probability: s.probability,
                rottenDays: s.rottenDays,
                requiredFields: s.requiredFields as Prisma.InputJsonValue,
                color: s.color,
                isWon: s.isWon ?? false,
                isLost: s.isLost ?? false,
              })),
            },
          },
          include: {
            stages: true,
            _count: { select: { deals: true } },
          },
        });
      });
      created.stages = orderedStages(created.stages).map((s) => ({
        ...s,
        position: s.order,
      }));
      return created;
    },

    async updatePipeline(
      tenantId: string,
      id: string,
      data: UpdatePipelineInput
    ): Promise<Pipeline> {
      await loadPipelineOrThrow(tenantId, id);
      return prisma.$transaction(async (tx) => {
        if (data.isDefault) {
          await tx.pipeline.updateMany({
            where: { tenantId, isDefault: true, NOT: { id } },
            data: { isDefault: false },
          });
        }
        const update: Prisma.PipelineUpdateInput = {};
        if (data.name !== undefined) update.name = data.name;
        if (data.type !== undefined) update.type = data.type;
        if (data.description !== undefined) update.description = data.description;
        if (data.ownedBy !== undefined) update.ownedBy = data.ownedBy;
        if (data.currency !== undefined) update.currency = data.currency;
        if (data.isDefault !== undefined) update.isDefault = data.isDefault;
        if (data.isActive !== undefined) update.isActive = data.isActive;
        return tx.pipeline.update({ where: { id }, data: update });
      });
    },

    async deletePipeline(tenantId: string, id: string): Promise<void> {
      const pipeline = await loadPipelineOrThrow(tenantId, id);
      if (pipeline.isDefault) {
        throw new BusinessRuleError('Cannot delete the default pipeline');
      }
      const openDeals = await prisma.deal.count({
        where: { pipelineId: id, tenantId, status: 'OPEN' },
      });
      if (openDeals > 0) {
        throw new BusinessRuleError('Cannot delete pipeline with open deals');
      }
      await prisma.pipeline.update({ where: { id } as any, data: { deletedAt: new Date() } as any });
    },

    async restorePipeline(tenantId: string, id: string): Promise<Pipeline> {
      const result = await prisma.pipeline.updateMany({
        where: { id, tenantId, deletedAt: { not: null } } as any,
        data: { deletedAt: null } as any,
      });
      if (result.count === 0) throw new NotFoundError('Pipeline', id);
      return prisma.pipeline.findFirstOrThrow({ where: { id, tenantId } });
    },

    // ─── Stages ────────────────────────────────────────────────────────────

    async listStages(tenantId: string, pipelineId: string): Promise<Stage[]> {
      await loadPipelineOrThrow(tenantId, pipelineId);
      const rows = await prisma.stage.findMany({
        where: { pipelineId, tenantId },
      });
      return orderedStages(rows);
    },

    async createStage(
      tenantId: string,
      pipelineId: string,
      data: CreateStageInput
    ): Promise<Stage> {
      await loadPipelineOrThrow(tenantId, pipelineId);
      const conflict = await prisma.stage.findFirst({
        where: { pipelineId, name: data.name },
      });
      if (conflict) throw new ConflictError('Stage', 'name');

      const resolvedOrder =
        data.order ?? (data as { position?: number }).position ?? 0;
      return prisma.stage.create({
        data: {
          tenantId,
          pipelineId,
          name: data.name,
          order: resolvedOrder,
          probability: data.probability,
          rottenDays: data.rottenDays,
          requiredFields: data.requiredFields as Prisma.InputJsonValue,
          color: data.color,
          isWon: data.isWon ?? false,
          isLost: data.isLost ?? false,
        },
      });
    },

    async updateStage(
      tenantId: string,
      pipelineId: string,
      stageId: string,
      data: UpdateStageInput
    ): Promise<Stage> {
      await loadPipelineOrThrow(tenantId, pipelineId);
      const stage = await prisma.stage.findFirst({
        where: { id: stageId, pipelineId, tenantId },
      });
      if (!stage) throw new NotFoundError('Stage', stageId);

      const update: Prisma.StageUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.order !== undefined) update.order = data.order;
      const posOnly = data as { position?: number };
      if (posOnly.position !== undefined) update.order = posOnly.position;
      if (data.probability !== undefined) update.probability = data.probability;
      if (data.rottenDays !== undefined) update.rottenDays = data.rottenDays;
      if (data.requiredFields !== undefined) {
        update.requiredFields = data.requiredFields as Prisma.InputJsonValue;
      }
      if (data.color !== undefined) update.color = data.color;
      if (data.isWon !== undefined) update.isWon = data.isWon;
      if (data.isLost !== undefined) update.isLost = data.isLost;
      return prisma.stage.update({ where: { id: stageId }, data: update });
    },

    async deleteStage(
      tenantId: string,
      pipelineId: string,
      stageId: string
    ): Promise<void> {
      await loadPipelineOrThrow(tenantId, pipelineId);
      const openDeals = await prisma.deal.count({
        where: { stageId, tenantId, status: 'OPEN' },
      });
      if (openDeals > 0) {
        throw new BusinessRuleError('Cannot delete stage with open deals');
      }
      await prisma.stage.update({ where: { id: stageId } as any, data: { deletedAt: new Date() } as any });
    },

    async restoreStage(tenantId: string, pipelineId: string, stageId: string): Promise<Stage> {
      await loadPipelineOrThrow(tenantId, pipelineId);
      const result = await prisma.stage.updateMany({
        where: { id: stageId, tenantId, deletedAt: { not: null } } as any,
        data: { deletedAt: null } as any,
      });
      if (result.count === 0) throw new NotFoundError('Stage', stageId);
      return prisma.stage.findFirstOrThrow({ where: { id: stageId, tenantId } });
    },
  };
}

export type PipelinesService = ReturnType<typeof createPipelinesService>;
