import type { DataPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/data-client/index.js';

export interface PaginatedParams {
  page: number;
  limit: number;
}

export function createRecycleService(prisma: DataPrisma) {
  return {
    async softDelete(
      tenantId: string,
      module: string,
      recordId: string,
      recordSnapshot: Record<string, unknown>,
      deletedBy: string
    ) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      return prisma.recycleBinItem.create({
        data: {
          tenantId,
          module,
          recordId,
          recordSnapshot: recordSnapshot as Prisma.InputJsonValue,
          deletedBy,
          expiresAt,
        },
      });
    },

    async listBin(
      tenantId: string,
      module: string | undefined,
      page: number,
      limit: number
    ) {
      const where = {
        tenantId,
        module,
        expiresAt: { gt: new Date() },
      };
      const [data, total] = await Promise.all([
        prisma.recycleBinItem.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { deletedAt: 'desc' },
        }),
        prisma.recycleBinItem.count({ where }),
      ]);
      return { data, total, page, limit };
    },

    async restore(tenantId: string, id: string) {
      const item = await prisma.recycleBinItem.findFirst({
        where: { id, tenantId },
      });
      if (!item) return null;
      await prisma.recycleBinItem.delete({ where: { id: item.id } });
      return item.recordSnapshot as Record<string, unknown>;
    },

    async purge(tenantId: string, id: string) {
      const item = await prisma.recycleBinItem.findFirst({
        where: { id, tenantId },
      });
      if (!item) return null;
      return prisma.recycleBinItem.delete({ where: { id: item.id } });
    },

    async purgeExpired() {
      return prisma.recycleBinItem.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
    },
  };
}
