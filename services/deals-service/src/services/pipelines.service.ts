import { NotFoundError } from '@nexus/service-utils';
import type { CreatePipelineInput, UpdatePipelineInput, CreateStageInput, UpdateStageInput } from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/deals-client/index.js';
import type { Pipeline, Stage } from '../../../../node_modules/.prisma/deals-client/index.js';
import type { DealsPrisma } from '../prisma.js';

/**
 * Normalize a stage's `requiredFields` into a clean `string[]` for persistence.
 * Fail-open: anything that isn't a usable list of field names becomes `[]`,
 * which the mover treats as "no gating".
 */
function normalizeRequiredFields(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/**
 * Normalize `entryConditions` into a `Prisma.InputJsonValue` array. The
 * validation schema does not (yet) surface entryConditions on the stage body,
 * so this only takes effect when a caller passes them through programmatically
 * or via seed data. Fail-open: non-arrays persist as `[]` (no gating).
 */
function normalizeEntryConditions(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input as Prisma.InputJsonValue;
}

export function createPipelinesService(prisma: DealsPrisma) {
  async function loadPipelineOrThrow(tenantId: string, id: string): Promise<Pipeline> {
    const row = await prisma.pipeline.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Pipeline', id);
    return row;
  }

  async function loadStageOrThrow(tenantId: string, pipelineId: string, stageId: string): Promise<Stage> {
    const row = await prisma.stage.findFirst({ where: { id: stageId, pipelineId, tenantId } });
    if (!row) throw new NotFoundError('Stage', stageId);
    return row;
  }

  return {
    async listPipelines(tenantId: string): Promise<Pipeline[]> {
      return prisma.pipeline.findMany({
    where: { tenantId }, include: { stages: { orderBy: { order: 'asc' } } }, orderBy: { createdAt: 'asc' }, take: 200 });
    },

    async getPipelineById(tenantId: string, id: string): Promise<Pipeline & { stages: Stage[] }> {
      const row = await prisma.pipeline.findFirst({ where: { id, tenantId }, include: { stages: { orderBy: { order: 'asc' } } } });
      if (!row) throw new NotFoundError('Pipeline', id);
      return row;
    },

    async createPipeline(tenantId: string, data: CreatePipelineInput): Promise<Pipeline> {
      const stages = data.stages?.length
        ? data.stages.map((s, idx) => ({
            tenantId,
            name: s.name,
            order: s.position ?? s.order ?? idx,
            probability: s.probability ?? 0,
            rottenDays: s.rottenDays ?? 30,
            color: s.color ?? '#6B7280',
            isWon: s.isWon ?? false,
            isLost: s.isLost ?? false,
            requiredFields: normalizeRequiredFields(s.requiredFields),
            entryConditions: normalizeEntryConditions((s as { entryConditions?: unknown }).entryConditions),
          }))
        : [];
      return prisma.pipeline.create({
        data: {
          tenantId,
          name: data.name,
          type: data.type ?? 'sales',
          currency: data.currency ?? 'USD',
          isDefault: data.isDefault ?? false,
          isActive: data.isActive ?? true,
          description: data.description ?? null,
          ownedBy: data.ownedBy ?? null,
          stages: { create: stages },
        },
        include: { stages: true },
      });
    },

    async updatePipeline(tenantId: string, id: string, data: UpdatePipelineInput): Promise<Pipeline> {
      await loadPipelineOrThrow(tenantId, id);
      const update: Prisma.PipelineUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.type !== undefined) update.type = data.type;
      if (data.currency !== undefined) update.currency = data.currency;
      if (data.isDefault !== undefined) update.isDefault = data.isDefault;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      if (data.description !== undefined) update.description = data.description;
      if (data.ownedBy !== undefined) update.ownedBy = data.ownedBy;
      return prisma.pipeline.update({ where: { id }, data: update });
    },

    async deletePipeline(tenantId: string, id: string): Promise<void> {
      await loadPipelineOrThrow(tenantId, id);
      await prisma.pipeline.delete({ where: { id } });
    },

    async listStages(tenantId: string, pipelineId: string): Promise<Stage[]> {
      await loadPipelineOrThrow(tenantId, pipelineId);
      return prisma.stage.findMany({
    take: 500, where: { pipelineId, tenantId }, orderBy: { order: 'asc' } });
    },

    async createStage(tenantId: string, pipelineId: string, data: CreateStageInput): Promise<Stage> {
      await loadPipelineOrThrow(tenantId, pipelineId);
      const maxOrder = await prisma.stage.aggregate({ where: { pipelineId }, _max: { order: true } });
      return prisma.stage.create({
        data: {
          tenantId,
          pipelineId,
          name: data.name,
          order: data.position ?? data.order ?? (maxOrder._max.order ?? -1) + 1,
          probability: data.probability ?? 0,
          rottenDays: data.rottenDays ?? 30,
          color: data.color ?? '#6B7280',
          isWon: data.isWon ?? false,
          isLost: data.isLost ?? false,
          requiredFields: normalizeRequiredFields(data.requiredFields),
          entryConditions: normalizeEntryConditions((data as { entryConditions?: unknown }).entryConditions),
        },
      });
    },

    async updateStage(tenantId: string, pipelineId: string, stageId: string, data: UpdateStageInput): Promise<Stage> {
      await loadStageOrThrow(tenantId, pipelineId, stageId);
      const update: Prisma.StageUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.position !== undefined || data.order !== undefined) update.order = data.position ?? data.order;
      if (data.probability !== undefined) update.probability = data.probability;
      if (data.rottenDays !== undefined) update.rottenDays = data.rottenDays;
      if (data.color !== undefined) update.color = data.color;
      if (data.isWon !== undefined) update.isWon = data.isWon;
      if (data.isLost !== undefined) update.isLost = data.isLost;
      if (data.requiredFields !== undefined) update.requiredFields = normalizeRequiredFields(data.requiredFields);
      const entryConditions = (data as { entryConditions?: unknown }).entryConditions;
      if (entryConditions !== undefined) update.entryConditions = normalizeEntryConditions(entryConditions);
      return prisma.stage.update({ where: { id: stageId }, data: update });
    },

    async deleteStage(tenantId: string, pipelineId: string, stageId: string): Promise<void> {
      await loadStageOrThrow(tenantId, pipelineId, stageId);
      await prisma.stage.delete({ where: { id: stageId } });
    },
  };
}

export type PipelinesService = ReturnType<typeof createPipelinesService>;
