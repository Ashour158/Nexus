import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { NotFoundError } from '@nexus/service-utils';
import type {
  CreatePlaybookInput,
  UpdatePlaybookInput,
  UpsertPlaybookStageInput,
} from '@nexus/validation';
import type { BlueprintPrisma } from '../prisma.js';
import { alsStore } from '../request-context.js';

function tenantId(): string {
  return alsStore.get('tenantId') as string;
}

export function createPlaybooksService(prisma: BlueprintPrisma, producer: NexusProducer) {
  return {
    async list() {
      return prisma.playbook.findMany({
        where: { isActive: true },
        include: { stages: { orderBy: { position: 'asc' } } },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async getById(id: string) {
      const row = await prisma.playbook.findFirst({
        where: { id },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
      if (!row) throw new NotFoundError('Playbook', id);
      return row;
    },

    async create(input: CreatePlaybookInput) {
      const tid = tenantId();
      const row = await prisma.playbook.create({
        data: {
          tenantId: tid,
          name: input.name,
          description: input.description,
          pipelineId: input.pipelineId,
        },
      });
      await producer.publish(TOPICS.BLUEPRINT, {
        type: 'blueprint.playbook.created',
        tenantId: tid,
        payload: { playbookId: row.id, tenantId: tid, name: row.name },
      });
      return row;
    },

    async update(id: string, input: UpdatePlaybookInput) {
      await this.getById(id);
      const tid = tenantId();
      const row = await prisma.playbook.update({
        where: { id },
        data: { ...input, version: { increment: 1 } },
      });
      await producer.publish(TOPICS.BLUEPRINT, {
        type: 'blueprint.playbook.updated',
        tenantId: tid,
        payload: { playbookId: row.id, tenantId: tid },
      });
      return row;
    },

    async delete(id: string) {
      await prisma.playbook.delete({ where: { id } });
    },

    async upsertStage(playbookId: string, input: UpsertPlaybookStageInput) {
      await this.getById(playbookId);
      const tid = tenantId();
      const existing = await prisma.playbookStage.findFirst({
        where: { playbookId, stageId: input.stageId },
      });
      const data = {
        stageName: input.stageName,
        position: input.position,
        entryActions: (input.entryActions ?? []) as object,
        exitCriteria: (input.exitCriteria ?? []) as object,
        requiredFields: input.requiredFields ?? [],
        talkingPoints: input.talkingPoints ?? [],
        resources: (input.resources ?? []) as object,
      };
      let row;
      if (existing) {
        row = await prisma.playbookStage.update({
          where: { id: existing.id },
          data,
        });
      } else {
        row = await prisma.playbookStage.create({
          data: {
            tenantId: tid,
            playbookId,
            stageId: input.stageId,
            ...data,
          },
        });
      }
      await producer.publish(TOPICS.BLUEPRINT, {
        type: 'blueprint.stage.upserted',
        tenantId: tid,
        payload: { playbookId, tenantId: tid, stageId: row.id },
      });
      return row;
    },
  };
}
