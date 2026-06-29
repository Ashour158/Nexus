import { NotFoundError } from '@nexus/service-utils';
import type { CreateCustomFieldInput, UpdateCustomFieldInput } from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { CustomFieldDefinition } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';


export function createCustomFieldsService(prisma: MetadataPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<CustomFieldDefinition> {
    const row = await prisma.customFieldDefinition.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('CustomFieldDefinition', id);
    return row;
  }

  return {
    async listCustomFields(tenantId: string, entityType?: string): Promise<CustomFieldDefinition[]> {
      return prisma.customFieldDefinition.findMany({
        where: { tenantId, ...(entityType ? { entityType } : {}) },
        orderBy: { position: 'asc' },
      });
    },

    async getCustomFieldById(tenantId: string, id: string): Promise<CustomFieldDefinition> {
      return loadOrThrow(tenantId, id);
    },

    async createCustomField(tenantId: string, data: CreateCustomFieldInput): Promise<CustomFieldDefinition> {
      return prisma.customFieldDefinition.create({
        data: {
          tenantId,
          entityType: data.entityType,
          name: data.name,
          apiKey: data.apiKey,
          fieldType: data.fieldType,
          options: data.options as Prisma.InputJsonValue,
          required: data.required ?? false,
          showOnCard: data.showOnCard ?? false,
          position: data.position ?? 0,
        },
      });
    },

    async updateCustomField(tenantId: string, id: string, data: UpdateCustomFieldInput): Promise<CustomFieldDefinition> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.CustomFieldDefinitionUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.apiKey !== undefined) update.apiKey = data.apiKey;
      if (data.fieldType !== undefined) update.fieldType = data.fieldType;
      if (data.options !== undefined) update.options = data.options as Prisma.InputJsonValue;
      if (data.required !== undefined) update.required = data.required;
      if (data.showOnCard !== undefined) update.showOnCard = data.showOnCard;
      if (data.position !== undefined) update.position = data.position;
      if ((data as any).isActive !== undefined) update.isActive = (data as any).isActive;
      return prisma.customFieldDefinition.update({ where: { id }, data: update as any });
    },

    async deleteCustomField(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.customFieldDefinition.delete({ where: { id } });
    },
  };
}

export type CustomFieldsService = ReturnType<typeof createCustomFieldsService>;
