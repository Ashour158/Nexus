import type { Prisma } from '../../../../node_modules/.prisma/data-client/index.js';
import type { DataPrisma } from '../prisma.js';

export interface SavedViewInput {
  name: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc';
  isDefault?: boolean;
}

export function createViewsService(prisma: DataPrisma) {
  return {
    async listViews(tenantId: string, userId: string, module: string) {
      return prisma.savedView.findMany({
        where: { tenantId, userId, module },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    },

    async createView(
      tenantId: string,
      userId: string,
      module: string,
      input: SavedViewInput
    ) {
      return prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.savedView.updateMany({
            where: { tenantId, userId, module, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.savedView.create({
          data: {
            tenantId,
            userId,
            module,
            name: input.name,
            filters: (input.filters ?? {}) as Prisma.InputJsonValue,
            columns: (input.columns ?? []) as Prisma.InputJsonValue,
            sortBy: input.sortBy ?? null,
            sortDir: input.sortDir ?? 'asc',
            isDefault: input.isDefault ?? false,
          },
        });
      });
    },

    async updateView(
      tenantId: string,
      id: string,
      input: Partial<SavedViewInput>
    ) {
      const existing = await prisma.savedView.findFirst({ where: { id, tenantId } });
      if (!existing) return null;
      return prisma.$transaction(async (tx) => {
        if (input.isDefault === true) {
          await tx.savedView.updateMany({
            where: {
              tenantId,
              userId: existing.userId,
              module: existing.module,
              isDefault: true,
            },
            data: { isDefault: false },
          });
        }
        const data: Prisma.SavedViewUpdateInput = {
          name: input.name,
          filters: input.filters as Prisma.InputJsonValue | undefined,
          columns: input.columns as Prisma.InputJsonValue | undefined,
          sortBy: input.sortBy ?? undefined,
          sortDir: input.sortDir,
          isDefault: input.isDefault,
        };
        return tx.savedView.update({ where: { id }, data });
      });
    },

    async deleteView(tenantId: string, id: string) {
      const existing = await prisma.savedView.findFirst({ where: { id, tenantId } });
      if (!existing) return null;
      return prisma.savedView.delete({ where: { id } });
    },
  };
}
