import type { ReportingPrisma } from '../prisma.js';

export interface AuditLogEntry {
  tenantId: string;
  userId: string;
  action: 'report_executed' | 'report_exported' | 'report_scheduled' | 'report_deleted';
  reportId: string;
  reportName: string;
  format?: string;
  metadata?: Record<string, unknown>;
}

// Type-safe wrapper that works before Prisma client regeneration
// After regenerating Prisma client, this cast can be removed
function getAuditLogModel(prisma: ReportingPrisma) {
  return (prisma as unknown as Record<string, unknown>)['reportAuditLog'] as {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: { where: Record<string, unknown>; skip: number; take: number; orderBy: Record<string, string> }) => Promise<unknown[]>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  } | undefined;
}

export function createReportAuditLogger(prisma: ReportingPrisma) {
  return {
    async log(entry: AuditLogEntry): Promise<void> {
      const model = getAuditLogModel(prisma);
      if (!model) {
        // Graceful degradation if model doesn't exist yet (Prisma not regenerated)
        console.warn('[audit] ReportAuditLog model not available; skipping audit log');
        return;
      }
      await model.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          reportId: entry.reportId,
          reportName: entry.reportName,
          format: entry.format ?? null,
          metadata: entry.metadata ?? {},
        },
      });
    },

    async list(tenantId: string, page = 1, limit = 50) {
      const model = getAuditLogModel(prisma);
      if (!model) {
        return { data: [] as unknown[], total: 0, page, limit };
      }
      const [data, total] = await Promise.all([
        model.findMany({
          where: { tenantId },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        model.count({ where: { tenantId } }),
      ]);
      return { data, total, page, limit };
    },
  };
}
