import type { CrmPrisma } from '../prisma.js';
import type { JwtPayload } from '@nexus/shared-types';
import { governanceFailClosed } from './governance-mode.js';

/**
 * Record-level access control — Org-Wide Defaults + Sharing Rules + Manual
 * Sharing (Zoho's "Data Sharing Settings").
 *
 * DESIGN: ADDITIVE, OPT-IN, FAIL-OPEN.
 *  - A (tenant, module) with NO OrgWideDefault row AND NO SharingRule row is
 *    UNCONFIGURED. {@link isSharingConfigured} returns false and every caller
 *    skips all checks, so behavior is byte-for-byte identical to before this
 *    feature existed.
 *  - When configured but no OrgWideDefault row exists for the module, the module
 *    default is PUBLIC_READ_WRITE (fail-open), preserving today's permissive
 *    behavior for that module.
 *  - Any internal error during resolution → allow (log + return true). We never
 *    block a legitimate operation because our own evaluation broke.
 *
 * SUPER_ADMIN / ADMIN always bypass. The record owner always has full access.
 */

export type SharingModule = 'account' | 'contact' | 'deal' | 'lead';
export type AccessMode = 'read' | 'write';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/** Minimal record shape the resolver needs. Extra fields are ignored. */
export interface AccessibleRecord {
  id?: string;
  ownerId?: string | null;
  territoryId?: string | null;
  [key: string]: unknown;
}

/**
 * Is record-level sharing CONFIGURED for this (tenant, module)? True when at
 * least one OrgWideDefault OR one SharingRule row exists. When false, callers
 * MUST skip all sharing checks (zero behavior change). ManualShare rows alone do
 * not "configure" a module — with no OWD the module is fail-open PUBLIC_READ_WRITE
 * anyway, so a manual grant can never be the sole thing restricting access.
 *
 * FAIL-OPEN: on any error returns false (skip checks).
 */
export async function isSharingConfigured(
  prisma: CrmPrisma,
  tenantId: string,
  module: SharingModule
): Promise<boolean> {
  try {
    const [owd, rule] = await Promise.all([
      prisma.orgWideDefault.findFirst({ where: { tenantId, module }, select: { id: true } }),
      prisma.sharingRule.findFirst({ where: { tenantId, module }, select: { id: true } }),
    ]);
    return Boolean(owd || rule);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[sharing] isSharingConfigured failed for ${module}; treating as unconfigured (fail-open)`, err);
    return false;
  }
}

/**
 * Load the minimal owner/territory fields needed to evaluate access for a single
 * record, tenant-scoped. Returns null if the record does not exist. Used by the
 * PATCH / lock enforcement paths. FAIL-OPEN callers should treat a thrown error
 * as "skip" — this only throws on genuinely broken queries.
 */
export async function loadRecordForAccess(
  prisma: CrmPrisma,
  tenantId: string,
  module: SharingModule,
  recordId: string
): Promise<AccessibleRecord | null> {
  switch (module) {
    case 'lead': {
      const r = await prisma.lead.findFirst({ where: { id: recordId, tenantId }, select: { id: true, ownerId: true, territoryId: true } });
      return r ?? null;
    }
    case 'deal': {
      const r = await prisma.deal.findFirst({ where: { id: recordId, tenantId }, select: { id: true, ownerId: true } });
      return r ?? null;
    }
    case 'account': {
      const r = await prisma.account.findFirst({ where: { id: recordId, tenantId }, select: { id: true, ownerId: true } });
      return r ?? null;
    }
    case 'contact': {
      const r = await prisma.contact.findFirst({ where: { id: recordId, tenantId }, select: { id: true, ownerId: true } });
      return r ?? null;
    }
    default:
      return null;
  }
}

/** accessLevel string ⇒ does it satisfy the requested mode? */
function levelGrants(accessLevel: string | null | undefined, mode: AccessMode): boolean {
  if (!accessLevel) return false;
  switch (accessLevel) {
    case 'PUBLIC_READ_WRITE':
    case 'READ_WRITE':
      return true;
    case 'PUBLIC_READ':
    case 'READ':
      return mode === 'read';
    case 'PRIVATE':
    default:
      return false;
  }
}

/** Does a sharing rule's `target` identify the current caller? */
function targetMatchesCaller(targetType: string, targetValue: string, jwt: JwtPayload): boolean {
  const roles = jwt.roles ?? [];
  switch (targetType) {
    case 'ROLE':
      return roles.includes(targetValue);
    case 'USER':
    case 'OWNER':
      return jwt.sub === targetValue;
    // GROUP / TERRITORY targets require group membership we cannot resolve here.
    // Fail-closed on the TARGET so an unresolvable rule never grants access.
    default:
      return false;
  }
}

/** Does a sharing rule's `source` cover the record being accessed? */
function sourceMatchesRecord(sourceType: string, sourceValue: string, record: AccessibleRecord): boolean {
  switch (sourceType) {
    case 'OWNER':
    case 'USER':
      return record.ownerId === sourceValue;
    case 'TERRITORY':
      return record.territoryId != null && record.territoryId === sourceValue;
    // ROLE / GROUP source: we cannot resolve the OWNER's role/group membership
    // from here, so we treat the source as matching (permissive on SOURCE only).
    // Access is still gated by the strict TARGET match above, so this widens the
    // set of records a correctly-targeted caller sees — the admin's intent.
    case 'ROLE':
    case 'GROUP':
      return true;
    default:
      return false;
  }
}

/**
 * Can `jwt` access `record` in `module` at `mode`? Resolution order:
 *  1. ADMIN / SUPER_ADMIN            → allow
 *  2. record owner                   → allow (full)
 *  3. hierarchy access (if OWD.grantHierarchyAccess and owner ∈ subordinateIds)
 *  4. ManualShare granting the level → allow
 *  5. OrgWideDefault:
 *       none            → PUBLIC_READ_WRITE (allow)
 *       PUBLIC_READ_WRITE → allow
 *       PUBLIC_READ       → allow read; write falls through
 *       PRIVATE           → falls through
 *  6. any active SharingRule granting the needed level → allow
 *  7. otherwise → deny
 *
 * `subordinateIds` (optional) is the set of user ids reporting to the caller,
 * resolved once per request by the route; when omitted hierarchy access is
 * skipped. FAIL-OPEN: any thrown error → allow.
 */
export async function canAccessRecord(
  prisma: CrmPrisma,
  tenantId: string,
  jwt: JwtPayload,
  module: SharingModule,
  record: AccessibleRecord,
  mode: AccessMode,
  subordinateIds?: Set<string>
): Promise<boolean> {
  try {
    const roles = jwt.roles ?? [];
    if (roles.some((r) => ADMIN_ROLES.has(r))) return true;

    // Owner always has full access.
    if (record.ownerId && record.ownerId === jwt.sub) return true;

    // Org-Wide Default for the module (none ⇒ fail-open PUBLIC_READ_WRITE).
    const owd = await prisma.orgWideDefault.findFirst({
      where: { tenantId, module },
      select: { accessLevel: true, grantHierarchyAccess: true },
    });

    // Manager hierarchy access: a manager sees/edits subordinates' records when
    // the module grants hierarchy access (default true when no OWD row).
    const hierarchyEnabled = owd ? owd.grantHierarchyAccess : true;
    if (
      hierarchyEnabled &&
      subordinateIds &&
      record.ownerId &&
      subordinateIds.has(record.ownerId)
    ) {
      return true;
    }

    // Explicit manual shares on this record.
    if (record.id) {
      const shares = await prisma.manualShare.findMany({
        where: { tenantId, module, recordId: record.id },
        select: { granteeType: true, granteeId: true, accessLevel: true },
      });
      for (const s of shares) {
        const matchesCaller =
          (s.granteeType === 'USER' && s.granteeId === jwt.sub) ||
          (s.granteeType === 'ROLE' && roles.includes(s.granteeId));
        if (matchesCaller && levelGrants(s.accessLevel, mode)) return true;
      }
    }

    // Org-Wide Default evaluation.
    if (!owd) return true; // no OWD row ⇒ PUBLIC_READ_WRITE
    if (levelGrants(owd.accessLevel, mode)) return true;

    // Sharing rules that grant the needed level.
    const rules = await prisma.sharingRule.findMany({
      where: { tenantId, module, isActive: true },
      select: { sourceType: true, sourceValue: true, targetType: true, targetValue: true, accessLevel: true },
    });
    for (const rule of rules) {
      if (!levelGrants(rule.accessLevel, mode)) continue;
      if (!targetMatchesCaller(rule.targetType, rule.targetValue, jwt)) continue;
      if (!sourceMatchesRecord(rule.sourceType, rule.sourceValue, record)) continue;
      return true;
    }

    return false;
  } catch (err) {
    if (governanceFailClosed()) return false;
    // eslint-disable-next-line no-console
    console.warn(`[sharing] canAccessRecord failed for ${module}; allowing (fail-open)`, err);
    return true;
  }
}

/**
 * Filter a list of records down to those the caller may READ. Fail-open: if
 * sharing is unconfigured for the module the input is returned untouched; on any
 * error the input is returned untouched.
 */
export async function filterReadableRecords<T extends AccessibleRecord>(
  prisma: CrmPrisma,
  tenantId: string,
  jwt: JwtPayload,
  module: SharingModule,
  records: T[],
  subordinateIds?: Set<string>
): Promise<T[]> {
  try {
    if (records.length === 0) return records;
    if (!(await isSharingConfigured(prisma, tenantId, module))) return records;
    const out: T[] = [];
    for (const rec of records) {
      if (await canAccessRecord(prisma, tenantId, jwt, module, rec, 'read', subordinateIds)) {
        out.push(rec);
      }
    }
    return out;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[sharing] filterReadableRecords failed for ${module}; returning unfiltered (fail-open)`, err);
    return records;
  }
}
