import { ConflictError, NotFoundError, ValidationError } from '@nexus/service-utils';
import type { CreateCustomFieldInput, UpdateCustomFieldInput } from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { CustomFieldDefinition } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';
import { checkFieldDefinition } from './field-integrity.js';
import { filterDependentOptions, type DependentOptionsResult } from './dependent-picklist.js';

/** Prisma unique-constraint violation code. */
const P2002 = 'P2002';

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
      // Integrity guard: reserved names, valid type, well-formed apiKey.
      const issues = checkFieldDefinition(data, { partial: false });
      if (issues.length > 0) {
        throw new ValidationError('Invalid custom field definition', { issues });
      }
      try {
        return await prisma.customFieldDefinition.create({
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
      } catch (err) {
        // Turn the DB unique-constraint into a friendly 409 (unique apiKey per object).
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('Custom field', 'apiKey');
        }
        throw err;
      }
    },

    async updateCustomField(tenantId: string, id: string, data: UpdateCustomFieldInput): Promise<CustomFieldDefinition> {
      await loadOrThrow(tenantId, id);
      // Integrity guard on the supplied keys only (partial patch).
      const issues = checkFieldDefinition(data, { partial: true });
      if (issues.length > 0) {
        throw new ValidationError('Invalid custom field definition', { issues });
      }
      const update: Prisma.CustomFieldDefinitionUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.apiKey !== undefined) update.apiKey = data.apiKey;
      if (data.fieldType !== undefined) update.fieldType = data.fieldType;
      if (data.options !== undefined) update.options = data.options as Prisma.InputJsonValue;
      if (data.required !== undefined) update.required = data.required;
      if (data.showOnCard !== undefined) update.showOnCard = data.showOnCard;
      if (data.position !== undefined) update.position = data.position;
      if ((data as any).isActive !== undefined) update.isActive = (data as any).isActive;
      try {
        return await prisma.customFieldDefinition.update({ where: { id }, data: update as any });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('Custom field', 'apiKey');
        }
        throw err;
      }
    },

    async deleteCustomField(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.customFieldDefinition.delete({ where: { id } });
    },

    /**
     * Dependent picklists: given a picklist custom field and the currently
     * selected value of its controlling field, return the subset of options
     * that are valid for that parent value. Options with no `controllingValues`
     * are always available (fail-open). Never throws on malformed option JSON.
     */
    async getDependentOptions(
      tenantId: string,
      id: string,
      controllingValue: string | null | undefined
    ): Promise<DependentOptionsResult> {
      const field = await loadOrThrow(tenantId, id);
      return filterDependentOptions(field.options, controllingValue);
    },
  };
}

export type CustomFieldsService = ReturnType<typeof createCustomFieldsService>;
