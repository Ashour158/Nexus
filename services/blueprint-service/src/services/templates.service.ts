import { NotFoundError } from '@nexus/service-utils';
import type { CreateTemplateInput, UpdateTemplateInput } from '@nexus/validation';
import type { BlueprintPrisma } from '../prisma.js';
import { alsStore } from '../request-context.js';

export function createTemplatesService(prisma: BlueprintPrisma) {
  return {
    async list() {
      return prisma.dealTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
    },

    async getById(id: string) {
      const row = await prisma.dealTemplate.findFirst({ where: { id } });
      if (!row) throw new NotFoundError('DealTemplate', id);
      return row;
    },

    async create(input: CreateTemplateInput) {
      const tid = alsStore.get('tenantId') as string;
      return prisma.dealTemplate.create({
        data: {
          tenantId: tid,
          name: input.name,
          description: input.description,
          pipelineId: input.pipelineId,
          fields: (input.fields ?? []) as object,
        },
      });
    },

    async update(id: string, input: UpdateTemplateInput) {
      await this.getById(id);
      const data: Record<string, unknown> = { version: { increment: 1 } };
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.pipelineId !== undefined) data.pipelineId = input.pipelineId;
      if (input.fields !== undefined) data.fields = input.fields as object;
      return prisma.dealTemplate.update({
        where: { id },
        data,
      });
    },

    async delete(id: string) {
      await prisma.dealTemplate.delete({ where: { id } });
    },
  };
}
