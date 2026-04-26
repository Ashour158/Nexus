import type { DataPrisma } from '../prisma.js';

export function createAuditService(prisma: DataPrisma) {
  return {
    async log(
      tenantId: string,
      module: string,
      recordId: string,
      fieldName: string,
      oldValue: string | null | undefined,
      newValue: string | null | undefined,
      changedBy: string
    ) {
      return prisma.fieldAuditLog.create({
        data: {
          tenantId,
          module,
          recordId,
          fieldName,
          oldValue: oldValue ?? null,
          newValue: newValue ?? null,
          changedBy,
        },
      });
    },

    async getHistory(
      tenantId: string,
      module: string,
      recordId: string,
      page: number,
      limit: number
    ) {
      const where = { tenantId, module, recordId };
      const [data, total] = await Promise.all([
        prisma.fieldAuditLog.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { changedAt: 'desc' },
        }),
        prisma.fieldAuditLog.count({ where }),
      ]);
      return { data, total, page, limit };
    },
  };
}
