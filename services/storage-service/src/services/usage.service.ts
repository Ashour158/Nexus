import type { StoragePrisma } from '../prisma.js';

/**
 * Per-tenant storage usage + quota tracking (additive, FAIL-OPEN).
 *
 * Maintains a running total of bytes stored / file count per tenant in the
 * `StorageUsage` table (upserted on every upload/delete). None of these helpers
 * may ever crash a real upload:
 *  - {@link checkQuota} FAILS OPEN — if the quota lookup errors, the upload is
 *    allowed (returns `{ allowed: true }`).
 *  - {@link recordUpload} / {@link recordDelete} swallow their own errors; a
 *    failed usage bump must never fail the file operation.
 *
 * Quota is configured via `STORAGE_TENANT_QUOTA_BYTES` (0 / unset = unlimited).
 */

const QUOTA_BYTES = (() => {
  const raw = process.env.STORAGE_TENANT_QUOTA_BYTES;
  if (!raw) return 0n;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : 0n;
  } catch {
    return 0n;
  }
})();

export interface TenantUsage {
  tenantId: string;
  bytesUsed: number;
  fileCount: number;
  quotaBytes: number;
  /** Fraction of quota consumed (0..1); 0 when unlimited. */
  usageRatio: number;
}

export function createUsageService(prisma: StoragePrisma) {
  return {
    /** Whether quota enforcement is active (a positive quota is configured). */
    quotaEnabled(): boolean {
      return QUOTA_BYTES > 0n;
    },

    /**
     * Decide whether a new upload of `incomingBytes` is allowed for the tenant.
     * FAIL-OPEN: any error (or unlimited quota) returns `{ allowed: true }`.
     */
    async checkQuota(
      tenantId: string,
      incomingBytes: number
    ): Promise<{ allowed: boolean; bytesUsed?: number; quotaBytes?: number }> {
      if (QUOTA_BYTES <= 0n) return { allowed: true };
      try {
        const row = await prisma.storageUsage.findUnique({ where: { tenantId } });
        const used = row?.bytesUsed ?? 0n;
        const projected = used + BigInt(Math.max(0, Math.trunc(incomingBytes)));
        return {
          allowed: projected <= QUOTA_BYTES,
          bytesUsed: Number(used),
          quotaBytes: Number(QUOTA_BYTES),
        };
      } catch (err) {
        // Fail open: never block an upload because the usage lookup failed.
        console.warn('[storage-usage] checkQuota failed; allowing upload (fail-open)', err);
        return { allowed: true };
      }
    },

    /** Bump usage after a successful upload. Guarded — never throws. */
    async recordUpload(tenantId: string, bytes: number): Promise<void> {
      try {
        const delta = BigInt(Math.max(0, Math.trunc(bytes)));
        await prisma.storageUsage.upsert({
          where: { tenantId },
          create: { tenantId, bytesUsed: delta, fileCount: 1 },
          update: {
            bytesUsed: { increment: delta },
            fileCount: { increment: 1 },
          },
        });
      } catch (err) {
        console.warn('[storage-usage] recordUpload failed; usage may drift', err);
      }
    },

    /** Decrement usage after a successful delete. Guarded — never throws, clamps at 0. */
    async recordDelete(tenantId: string, bytes: number): Promise<void> {
      try {
        const delta = BigInt(Math.max(0, Math.trunc(bytes)));
        const row = await prisma.storageUsage.findUnique({ where: { tenantId } });
        if (!row) return;
        const nextBytes = row.bytesUsed - delta;
        await prisma.storageUsage.update({
          where: { tenantId },
          data: {
            bytesUsed: nextBytes > 0n ? nextBytes : 0n,
            fileCount: row.fileCount > 0 ? { decrement: 1 } : row.fileCount,
          },
        });
      } catch (err) {
        console.warn('[storage-usage] recordDelete failed; usage may drift', err);
      }
    },

    /** Current usage snapshot for a tenant. Never throws; returns zeros on error. */
    async getUsage(tenantId: string): Promise<TenantUsage> {
      const quotaBytes = Number(QUOTA_BYTES);
      try {
        const row = await prisma.storageUsage.findUnique({ where: { tenantId } });
        const bytesUsed = Number(row?.bytesUsed ?? 0n);
        return {
          tenantId,
          bytesUsed,
          fileCount: row?.fileCount ?? 0,
          quotaBytes,
          usageRatio: quotaBytes > 0 ? bytesUsed / quotaBytes : 0,
        };
      } catch (err) {
        console.warn('[storage-usage] getUsage failed; returning zeros', err);
        return { tenantId, bytesUsed: 0, fileCount: 0, quotaBytes, usageRatio: 0 };
      }
    },
  };
}

export type UsageService = ReturnType<typeof createUsageService>;
