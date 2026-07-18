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

/**
 * Raised when we could not determine whether a record is locked.
 *
 * Distinct from "there is no lock": callers MUST NOT treat this as unlocked.
 */
export class LockCheckUnavailableError extends Error {
  constructor(module: string, recordId: string, cause: unknown) {
    super(`Could not determine lock state for ${module}/${recordId}`);
    this.name = 'LockCheckUnavailableError';
    this.cause = cause;
  }
}

/**
 * Return the active lock on a record, or null when there is genuinely no lock.
 *
 * FAIL-CLOSED: if the lock table cannot be read we THROW rather than return
 * null. Returning null on error meant a transient DB blip silently disabled
 * record locking entirely — a record an admin had explicitly locked became
 * editable, and the only trace was a console warning. "I don't know" is not
 * "unlocked".
 */
export async function getActiveLock(
  prisma: CrmPrisma,
  tenantId: string,
  module: string,
  recordId: string
): Promise<ActiveLock | null> {
  try {
    return await prisma.recordLock.findFirst({
      where: { tenantId, module, recordId, unlockedAt: null },
      select: { id: true, reason: true, lockedBy: true, lockedAt: true },
      orderBy: { lockedAt: 'desc' },
    });
  } catch (err) {
    throw new LockCheckUnavailableError(module, recordId, err);
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
 * result into an HTTP 423.
 *
 * FAIL-CLOSED: if the lock state cannot be read this propagates
 * {@link LockCheckUnavailableError} instead of returning null, so the write is
 * rejected rather than silently allowed through an unreadable lock table.
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
