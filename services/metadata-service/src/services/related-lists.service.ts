import { NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { RelatedListConfig } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';

export interface CreateRelatedListInput {
  module: string;
  name: string;
  relatedModule: string;
  displayFields?: string[];
  sortBy?: string;
  visibleToProfiles?: string[];
  sortOrder?: number;
  isActive?: boolean;
}
export type UpdateRelatedListInput = Partial<Omit<CreateRelatedListInput, 'module'>>;

export function createRelatedListsService(prisma: MetadataPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<RelatedListConfig> {
    const row = await prisma.relatedListConfig.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('RelatedListConfig', id);
    return row;
  }

  return {
    /**
     * List related-list configs for a module (or all), ordered by sortOrder.
     * When `roles` is supplied, drop configs whose `visibleToProfiles` is
     * non-empty and excludes every one of the caller's roles.
     */
    async listConfigs(
      tenantId: string,
      opts: { module?: string; roles?: string[]; activeOnly?: boolean } = {}
    ): Promise<RelatedListConfig[]> {
      const rows = await prisma.relatedListConfig.findMany({
        where: {
          tenantId,
          ...(opts.module ? { module: opts.module } : {}),
          ...(opts.activeOnly ? { isActive: true } : {}),
        },
        orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (!opts.roles) return rows;
      const roleSet = new Set(opts.roles.map((r) => String(r)));
      return rows.filter(
        (r) =>
          !Array.isArray(r.visibleToProfiles) ||
          r.visibleToProfiles.length === 0 ||
          r.visibleToProfiles.some((p) => roleSet.has(p))
      );
    },

    async getConfig(tenantId: string, id: string): Promise<RelatedListConfig> {
      return loadOrThrow(tenantId, id);
    },

    async createConfig(tenantId: string, data: CreateRelatedListInput): Promise<RelatedListConfig> {
      return prisma.relatedListConfig.create({
        data: {
          tenantId,
          module: data.module,
          name: data.name,
          relatedModule: data.relatedModule,
          displayFields: data.displayFields ?? [],
          sortBy: data.sortBy ?? null,
          visibleToProfiles: data.visibleToProfiles ?? [],
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        },
      });
    },

    async updateConfig(tenantId: string, id: string, data: UpdateRelatedListInput): Promise<RelatedListConfig> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.RelatedListConfigUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.relatedModule !== undefined) update.relatedModule = data.relatedModule;
      if (data.displayFields !== undefined) update.displayFields = data.displayFields;
      if (data.sortBy !== undefined) update.sortBy = data.sortBy;
      if (data.visibleToProfiles !== undefined) update.visibleToProfiles = data.visibleToProfiles;
      if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      return prisma.relatedListConfig.update({ where: { id }, data: update });
    },

    async deleteConfig(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.relatedListConfig.delete({ where: { id } });
    },
  };
}

export type RelatedListsService = ReturnType<typeof createRelatedListsService>;
