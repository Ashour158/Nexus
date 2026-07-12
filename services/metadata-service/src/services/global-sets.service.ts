import { ConflictError, NotFoundError } from '@nexus/service-utils';
import type { CreateGlobalPicklistSetInput, UpdateGlobalPicklistSetInput } from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { GlobalPicklistSet } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';

/** Prisma unique-constraint violation code. */
const P2002 = 'P2002';

export function createGlobalSetsService(prisma: MetadataPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<GlobalPicklistSet> {
    const row = await prisma.globalPicklistSet.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('GlobalPicklistSet', id);
    return row;
  }

  return {
    async listSets(tenantId: string): Promise<GlobalPicklistSet[]> {
      return prisma.globalPicklistSet.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    },

    async getSet(tenantId: string, id: string): Promise<GlobalPicklistSet> {
      return loadOrThrow(tenantId, id);
    },

    async createSet(tenantId: string, data: CreateGlobalPicklistSetInput): Promise<GlobalPicklistSet> {
      try {
        return await prisma.globalPicklistSet.create({
          data: {
            tenantId,
            name: data.name,
            options: (data.options ?? []) as Prisma.InputJsonValue,
            isActive: data.isActive ?? true,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('GlobalPicklistSet', 'name');
        }
        throw err;
      }
    },

    async updateSet(tenantId: string, id: string, data: UpdateGlobalPicklistSetInput): Promise<GlobalPicklistSet> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.GlobalPicklistSetUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.options !== undefined) update.options = (data.options ?? []) as Prisma.InputJsonValue;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      try {
        return await prisma.globalPicklistSet.update({ where: { id }, data: update });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('GlobalPicklistSet', 'name');
        }
        throw err;
      }
    },

    async deleteSet(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      // Detach any custom fields still referencing this set so the FK doesn't
      // block the delete (fields fall back to their inline options).
      await prisma.customFieldDefinition.updateMany({
        where: { tenantId, globalSetId: id },
        data: { globalSetId: null },
      });
      await prisma.globalPicklistSet.delete({ where: { id } });
    },
  };
}

export type GlobalSetsService = ReturnType<typeof createGlobalSetsService>;
