import type { CrmPrisma } from '../prisma.js';
import type { JwtPayload } from '@nexus/shared-types';
import { resolveRecordScope } from '@nexus/service-utils';
import { lockBlockingWrite } from './record-lock.js';
import { isSharingConfigured, canAccessRecord, loadRecordForAccess, type SharingModule } from './sharing.js';
import { resolveTeamMemberIds } from './team-resolver.js';

/**
 * Unified write-access guard for the accounts / contacts / deals PATCH paths.
 *
 * Ordering (per the data-governance brief): LOCK check → SHARING/write check.
 * The review intercept and the actual write run AFTER this in the route.
 *
 * Fully OPT-IN and FAIL-OPEN:
 *  - Record locking is independent: an active lock the caller cannot bypass →
 *    blocked with status 423, regardless of sharing config.
 *  - Sharing is skipped entirely unless configured for the module (no
 *    OrgWideDefault and no SharingRule ⇒ allow). When configured, a caller who
 *    cannot WRITE the record is blocked with status 403.
 *  - Any internal error → allow (the individual helpers are fail-open).
 *
 * Returns `{ ok: true }` to proceed, or a blocking result the route turns into
 * the given HTTP status.
 */
export type WriteGuardResult =
  | { ok: true }
  | { ok: false; status: 423; code: 'LOCKED'; message: string; lock: unknown }
  | { ok: false; status: 403; code: 'FORBIDDEN'; message: string };

export async function guardRecordWrite(
  prisma: CrmPrisma,
  jwt: JwtPayload,
  module: SharingModule,
  recordId: string,
  token?: string
): Promise<WriteGuardResult> {
  // 1. Record lock.
  const lock = await lockBlockingWrite(prisma, jwt.tenantId, module, recordId, jwt);
  if (lock) {
    return { ok: false, status: 423, code: 'LOCKED', message: `Record is locked${lock.reason ? `: ${lock.reason}` : ''}`, lock };
  }

  // 2. Sharing (opt-in): only evaluated when configured for the module.
  if (await isSharingConfigured(prisma, jwt.tenantId, module)) {
    const record = await loadRecordForAccess(prisma, jwt.tenantId, module, recordId);
    // Record missing → let the downstream write path produce its own 404.
    if (record) {
      const allowed = await canAccessRecord(prisma, jwt.tenantId, jwt, module, record, 'write');
      if (!allowed) {
        return { ok: false, status: 403, code: 'FORBIDDEN', message: 'You do not have write access to this record' };
      }
    }
  }

  // 3. Ownership scope (own / team / all). Mirrors the READ scope — you cannot
  //    edit or delete what you cannot see. A plain grant / `:all` imposes nothing
  //    (admins and full-access roles are unaffected); `:own` requires the caller
  //    own the record; `:team` allows the caller's reporting sub-tree. Fail-open
  //    on any resolution error so a legitimate write is never blocked by a fault.
  try {
    const scope = resolveRecordScope(jwt.permissions ?? [], `${module}s:read`);
    if (scope !== 'all') {
      const rec = await (prisma as unknown as Record<string, { findFirst: (a: unknown) => Promise<{ ownerId: string | null } | null> }>)[
        module
      ].findFirst({ where: { id: recordId, tenantId: jwt.tenantId }, select: { ownerId: true } });
      // Missing record → let the write path 404; only enforce on records that exist.
      if (rec) {
        let inScope = rec.ownerId === jwt.sub;
        if (!inScope && scope === 'team') {
          const teamIds = await resolveTeamMemberIds(jwt.sub, token, jwt.tenantId);
          inScope = rec.ownerId != null && teamIds.includes(rec.ownerId);
        }
        if (!inScope) {
          return { ok: false, status: 403, code: 'FORBIDDEN', message: 'This record is outside your ownership scope' };
        }
      }
    }
  } catch {
    // fail-open: never block a legitimate write on a scope-resolution fault.
  }

  return { ok: true };
}

/** A record skipped by a bulk/mass operation because the write guard blocked it. */
export type SkippedRecord = {
  id: string;
  status: 423 | 403;
  code: 'LOCKED' | 'FORBIDDEN';
  message: string;
};

/**
 * Partition a set of record ids into those the caller may write and those the
 * write guard blocks (locked → 423, sharing-restricted → 403). Used by the
 * mass-/bulk-mutation paths so a locked or sharing-restricted record is never
 * silently mutated: blocked records are skipped and reported, the rest proceed.
 *
 * Same opt-in / fail-open semantics as {@link guardRecordWrite} — an
 * unconfigured tenant yields every id in `allowed` and an empty `skipped`.
 */
export async function partitionWritableRecords(
  prisma: CrmPrisma,
  jwt: JwtPayload,
  module: SharingModule,
  ids: string[],
  token?: string
): Promise<{ allowed: string[]; skipped: SkippedRecord[] }> {
  const allowed: string[] = [];
  const skipped: SkippedRecord[] = [];
  for (const id of ids) {
    const guard = await guardRecordWrite(prisma, jwt, module, id, token);
    if (guard.ok) {
      allowed.push(id);
    } else {
      skipped.push({ id, status: guard.status, code: guard.code, message: guard.message });
    }
  }
  return { allowed, skipped };
}
