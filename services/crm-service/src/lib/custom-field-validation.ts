import { ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

/**
 * Low-code governance (req 5): validate an incoming `customFields` JSON payload
 * against the tenant's `CustomFieldDefinition` rows for a given entity type.
 *
 * Contract:
 *  - Only keys that have an active definition are validated. Unknown keys pass
 *    through untouched (lenient — the UI may send transient/legacy keys).
 *  - `required` fields must be present and non-empty **when a customFields object
 *    is supplied**. (We do not force a customFields object to exist at all.)
 *  - `fieldType` is coerced/checked: text/textarea/string → string; number →
 *    finite number; boolean/checkbox → boolean; date → ISO-parseable;
 *    picklist/select → must be one of `options`; multiselect → array whose
 *    members are all in `options`.
 *  - Invalid input throws `ValidationError` (HTTP 422).
 *  - FAIL-OPEN: if the definitions query throws (DB hiccup, missing table on an
 *    un-migrated tenant), validation is skipped and the write proceeds.
 */

type FieldDef = {
  apiKey: string;
  fieldType: string;
  required: boolean;
  options: unknown;
};

const STRING_TYPES = new Set(['text', 'textarea', 'string', 'email', 'url', 'phone']);
const NUMBER_TYPES = new Set(['number', 'integer', 'decimal', 'currency', 'float']);
const BOOL_TYPES = new Set(['boolean', 'checkbox', 'bool']);
const DATE_TYPES = new Set(['date', 'datetime']);
const SINGLE_PICK_TYPES = new Set(['picklist', 'select', 'dropdown', 'enum']);
const MULTI_PICK_TYPES = new Set(['multiselect', 'multipicklist', 'tags']);

function toOptionList(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => {
      if (typeof o === 'string') return o;
      if (o && typeof o === 'object') {
        const rec = o as Record<string, unknown>;
        const v = rec.value ?? rec.label ?? rec.key;
        return typeof v === 'string' ? v : undefined;
      }
      return undefined;
    })
    .filter((v): v is string => typeof v === 'string');
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export async function validateCustomFields(
  prisma: CrmPrisma,
  tenantId: string,
  entityType: 'account' | 'contact',
  customFields: unknown
): Promise<void> {
  // Only an object payload is meaningful; anything else (undefined/null) is a no-op.
  const payload =
    customFields && typeof customFields === 'object' && !Array.isArray(customFields)
      ? (customFields as Record<string, unknown>)
      : undefined;

  let defs: FieldDef[];
  try {
    defs = (await (prisma as unknown as {
      customFieldDefinition: {
        findMany: (a: unknown) => Promise<FieldDef[]>;
      };
    }).customFieldDefinition.findMany({
      where: { tenantId, entityType, isActive: true, deletedAt: null },
      select: { apiKey: true, fieldType: true, required: true, options: true },
    })) as FieldDef[];
  } catch {
    // Fail-open: never block a write because governance metadata was unreadable.
    return;
  }

  if (!defs || defs.length === 0) return;

  const errors: Record<string, string> = {};
  const provided = payload ?? {};

  for (const def of defs) {
    const value = provided[def.apiKey];
    const present = def.apiKey in provided;

    if (def.required && (!present || isEmpty(value))) {
      errors[def.apiKey] = 'is required';
      continue;
    }

    // Absent optional field, or explicitly empty → nothing to type-check.
    if (!present || isEmpty(value)) continue;

    const type = (def.fieldType || '').toLowerCase();

    if (STRING_TYPES.has(type)) {
      if (typeof value !== 'string') errors[def.apiKey] = 'must be a string';
    } else if (NUMBER_TYPES.has(type)) {
      const n = typeof value === 'number' ? value : Number(value);
      if (typeof value === 'boolean' || Number.isNaN(n) || !Number.isFinite(n)) {
        errors[def.apiKey] = 'must be a number';
      }
    } else if (BOOL_TYPES.has(type)) {
      if (typeof value !== 'boolean') errors[def.apiKey] = 'must be a boolean';
    } else if (DATE_TYPES.has(type)) {
      const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
      if (Number.isNaN(t)) errors[def.apiKey] = 'must be a valid date';
    } else if (SINGLE_PICK_TYPES.has(type)) {
      const opts = toOptionList(def.options);
      if (opts.length > 0 && !opts.includes(String(value))) {
        errors[def.apiKey] = 'is not a valid option';
      }
    } else if (MULTI_PICK_TYPES.has(type)) {
      const opts = toOptionList(def.options);
      const arr = Array.isArray(value) ? value : [value];
      if (opts.length > 0 && !arr.every((v) => opts.includes(String(v)))) {
        errors[def.apiKey] = 'contains an invalid option';
      }
    }
    // Unknown fieldType → no structural check (lenient).
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Custom field validation failed', { customFields: errors });
  }
}
