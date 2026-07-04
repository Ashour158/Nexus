import type { CrmPrisma } from '../prisma.js';
import { ValidationError } from '@nexus/service-utils';
import { validateRecord } from './validation-rules.js';

/**
 * Additive, FAIL-SAFE write guards for the authoritative CRM write paths.
 *
 * Every function in this module is designed so that — with no configured
 * ValidationRule / FieldPermission rows, or on ANY internal error — the caller
 * behaves EXACTLY as it did before these guards existed. Guards never throw on
 * their own bugs; the only intentional throw is a clean {@link ValidationError}
 * (HTTP 422) raised when a genuinely-active validation rule fails.
 */

/**
 * Enforce active ValidationRule rows for an entity on a create/update write.
 *
 * FAIL-OPEN contract:
 *  - If there are NO active rules for the tenant+objectType → allow (return).
 *  - If rule evaluation THROWS for any reason → allow (log + return). We never
 *    block a save because our own evaluation broke.
 *  - Only when there is >= 1 active rule AND it genuinely fails do we throw a
 *    422 ValidationError.
 *
 * @param prisma      tenant-scoped CRM prisma client
 * @param tenantId    caller tenant
 * @param objectType  canonical entity key: 'lead' | 'deal' | 'account' | 'contact'
 * @param record      the flattened candidate record (post-merge for updates)
 */
export async function enforceValidationRules(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: string,
  record: Record<string, unknown>
): Promise<void> {
  let result: { valid: boolean; errors: string[] };
  try {
    result = await validateRecord(prisma, tenantId, objectType, record);
  } catch (err) {
    // Evaluation failure must NEVER block a save. Fail-open + log.
    // eslint-disable-next-line no-console
    console.warn(
      `[write-guards] validation rule evaluation failed for ${objectType}; allowing save (fail-open)`,
      err
    );
    return;
  }

  if (!result.valid && result.errors.length > 0) {
    throw new ValidationError(
      result.errors[0] ?? 'Validation failed',
      { objectType, errors: result.errors }
    );
  }
}

/**
 * Build the candidate record for an UPDATE by merging the persisted row with
 * the incoming partial patch. Validation rules must see the record as it WILL
 * be after the write, not just the changed keys.
 */
export function mergeForValidation(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * FieldPermission-aware write filtering.
 *
 * When FieldPermission rows exist for (tenant, objectType, field), a write to
 * that field is only allowed if the caller holds at least one of the field's
 * `allowedRoles`. Fields the caller may not write are STRIPPED from the update
 * payload (never cause a hard failure), so the rest of the save proceeds.
 *
 * FAIL-OPEN contract:
 *  - `roles` undefined  → no role context supplied → no restriction (return input untouched).
 *  - No FieldPermission rows for the objectType → no restriction.
 *  - Any error during lookup/evaluation → no restriction (log + return input untouched).
 *  - A field with NO matching FieldPermission row is always allowed.
 *
 * @returns the (possibly reduced) set of update keys that are permitted, plus
 *          the list of stripped field names for optional logging.
 */
export async function applyFieldPermissions<T extends Record<string, unknown>>(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: string,
  update: T,
  roles: string[] | undefined
): Promise<{ update: T; stripped: string[] }> {
  // No role context => cannot evaluate => fail-open (identical to today).
  if (roles === undefined) return { update, stripped: [] };

  try {
    const perms = await prisma.fieldPermission.findMany({
      where: { tenantId, objectType },
      select: { fieldName: true, allowedRoles: true },
    });

    // No rows => no restriction (fail-open).
    if (perms.length === 0) return { update, stripped: [] };

    const roleSet = new Set(roles);
    // Admin roles are never restricted by field permissions.
    if (roleSet.has('ADMIN') || roleSet.has('SUPER_ADMIN')) {
      return { update, stripped: [] };
    }

    const permByField = new Map<string, string[]>();
    for (const p of perms) {
      const allowed = Array.isArray(p.allowedRoles)
        ? (p.allowedRoles as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
      permByField.set(p.fieldName, allowed);
    }

    const next = { ...update } as T;
    const stripped: string[] = [];
    for (const field of Object.keys(update)) {
      const allowed = permByField.get(field);
      if (!allowed) continue; // no rule for this field => allowed
      const permitted = allowed.some((r) => roleSet.has(r));
      if (!permitted) {
        delete (next as Record<string, unknown>)[field];
        stripped.push(field);
      }
    }

    if (stripped.length > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `[write-guards] stripped ${stripped.length} field(s) on ${objectType} update due to FieldPermission: ${stripped.join(', ')}`
      );
    }
    return { update: next, stripped };
  } catch (err) {
    // Any failure => fail-open (behave as if no permissions configured).
    // eslint-disable-next-line no-console
    console.warn(
      `[write-guards] field permission evaluation failed for ${objectType}; allowing all writes (fail-open)`,
      err
    );
    return { update, stripped: [] };
  }
}
