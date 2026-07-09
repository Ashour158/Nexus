import { NotFoundError } from '@nexus/service-utils';
import type { CreateTagInput, UpdateTagInput } from '@nexus/validation';
import type { Tag } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';


export function createTagsService(prisma: MetadataPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Tag> {
    const row = await prisma.tag.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Tag', id);
    return row;
  }

  return {
    async listTags(tenantId: string, entityType?: string): Promise<Tag[]> {
      return prisma.tag.findMany({
        where: { tenantId, ...(entityType ? { entityType } : {}) },
        orderBy: { name: 'asc' },
      });
    },

    async getTagById(tenantId: string, id: string): Promise<Tag> {
      return loadOrThrow(tenantId, id);
    },

    async createTag(tenantId: string, data: CreateTagInput): Promise<Tag> {
      return prisma.tag.create({
        data: {
          tenantId,
          name: data.name,
          color: data.color ?? '#6B7280',
          entityType: data.entityType ?? null,
        },
      });
    },

    async updateTag(tenantId: string, id: string, data: UpdateTagInput): Promise<Tag> {
      await loadOrThrow(tenantId, id);
      const update: any = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.color !== undefined) update.color = data.color;
      if (data.entityType !== undefined) update.entityType = data.entityType;
      return prisma.tag.update({ where: { id }, data: update });
    },

    async deleteTag(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.tag.delete({ where: { id } });
    },
  };
}

export type TagsService = ReturnType<typeof createTagsService>;
