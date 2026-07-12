import type { CrmPrisma } from '../prisma.js';
import type { JwtPayload } from '@nexus/shared-types';

/**
 * Record locking (Zoho "record locking" / lock-on-approval).
 *
 * An ACTIVE lock is a {@link RecordLock} row with `unlockedAt = null`. There is
 * at most one active lock per (tenant, module, recordId) — enforced in
 * application logic here since Prisma cannot express a partial-unique index.
 *
 * While a record is actively locked, only an ADMIN/SUPER_ADMIN or the user who
 * placed the lock may modify it; everyone else is blocked (HTTP 423). This
 * module is FAIL-OPEN: any internal error → treat as unlocked (never block a
 * save because our own lookup broke).
 */

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export interface ActiveLock {
  id: string;
  reason: string | null;
  lockedBy: string;
  lockedAt: Date;
}

/** Return the active lock on a record, or null. FAIL-OPEN: errors → null. */
export async function getActiveLock(
  prisma: CrmPrisma,
  tenantId: string,
  module: string,
  recordId: string
): Promise<ActiveLock | null> {
  try {
    const lock = await prisma.recordLock.findFirst({
      where: { tenantId, module, recordId, unlockedAt: null },
      select: { id: true, reason: true, lockedBy: true, lockedAt: true },
      orderBy: { lockedAt: 'desc' },
    });
    return lock;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[record-lock] getActiveLock failed for ${module}/${recordId}; treating as unlocked (fail-open)`, err);
    return null;
  }
}

/** May this caller bypass an active lock (admin or the locker)? */
export function callerMayBypassLock(lock: ActiveLock, jwt: JwtPayload): boolean {
  const roles = jwt.roles ?? [];
  if (roles.some((r) => ADMIN_ROLES.has(r))) return true;
  return lock.lockedBy === jwt.sub;
}

/**
 * Enforcement helper for write paths: returns the active lock IFF the caller is
 * BLOCKED by it (i.e. a lock exists AND the caller cannot bypass it). Returns
 * null when there is no lock or the caller may write. The route turns a non-null
 * result into an HTTP 423. FAIL-OPEN: errors → null (write proceeds).
 */
export async function lockBlockingWrite(
  prisma: CrmPrisma,
  tenantId: string,
  module: string,
  recordId: string,
  jwt: JwtPayload
): Promise<ActiveLock | null> {
  const lock = await getActiveLock(prisma, tenantId, module, recordId);
  if (!lock) return null;
  if (callerMayBypassLock(lock, jwt)) return null;
  return lock;
}
