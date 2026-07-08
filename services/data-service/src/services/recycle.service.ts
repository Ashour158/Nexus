import type { DataPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/data-client/index.js';

export interface PaginatedParams {
  page: number;
  limit: number;
}

/**
 * Result of a restore attempt. The recycle bin row is only removed when the
 * owning service has actually cleared `deletedAt` (`ok: true`); every failure
 * path preserves the row so the record stays recoverable.
 */
export type RestoreResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: 'NOT_FOUND' | 'UNSUPPORTED_MODULE' | 'RESTORE_FAILED'; message: string };

/**
 * Maps a recycle bin `module` to the crm-service plural path segment that owns
 * the record and exposes `POST /api/v1/<plural>/:id/restore`. crm stores the
 * plural form (via its `moduleName()` helper); singular aliases are accepted
 * defensively. Only entity types with a real owning restore endpoint appear
 * here — anything else is reported as UNSUPPORTED_MODULE rather than dropped.
 */
const CRM_RESTORE_MODULES: Record<string, string> = {
  accounts: 'accounts',
  account: 'accounts',
  contacts: 'contacts',
  contact: 'contacts',
  deals: 'deals',
  deal: 'deals',
  leads: 'leads',
  lead: 'leads',
};

/**
 * Restore runs on behalf of the requesting user against crm's RBAC-gated
 * restore routes, so forward the caller's JWT (they hold `<module>:update`).
 * Fall back to the service token only if no caller auth was provided. Mirrors
 * the export service's outbound-to-crm auth pattern.
 */
function restoreAuthHeaders(authToken: string | undefined): Record<string, string> {
  if (authToken && authToken.trim()) {
    return { Authorization: authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}` };
  }
  return { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` };
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

    /**
     * Restore a soft-deleted record. Removing the bin row alone does NOT
     * un-delete anything — the real un-delete (clearing `deletedAt`) lives in
     * the owning service. So we call crm's `POST /api/v1/<plural>/:id/restore`
     * first and only delete the bin row once that succeeds (2xx). On any
     * failure the bin row is preserved so the record stays recoverable.
     */
    async restore(tenantId: string, id: string, authToken?: string): Promise<RestoreResult> {
      const item = await prisma.recycleBinItem.findFirst({
        where: { id, tenantId },
      });
      if (!item) {
        return { ok: false, code: 'NOT_FOUND', message: 'Recycle bin item not found' };
      }

      const plural = CRM_RESTORE_MODULES[item.module];
      if (!plural) {
        // No owning-service restore endpoint for this entity type. Do NOT drop
        // the bin row — surface a clear error so the item stays recoverable.
        return {
          ok: false,
          code: 'UNSUPPORTED_MODULE',
          message: `Restore is not supported for module "${item.module}"`,
        };
      }

      const crmUrl = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
      let res: Response;
      try {
        res = await fetch(`${crmUrl}/api/v1/${plural}/${item.recordId}/restore`, {
          method: 'POST',
          headers: { ...restoreAuthHeaders(authToken), 'Content-Type': 'application/json' },
          body: '{}',
        });
      } catch (err) {
        return {
          ok: false,
          code: 'RESTORE_FAILED',
          message: `Failed to reach crm-service to restore ${item.module}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          code: 'RESTORE_FAILED',
          message: `crm-service restore failed for ${item.module} ${item.recordId} (status ${res.status})`,
        };
      }

      // Owning service cleared `deletedAt` — now it's safe to remove the bin row.
      await prisma.recycleBinItem.delete({ where: { id: item.id } });
      return { ok: true, data: item.recordSnapshot as Record<string, unknown> };
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
