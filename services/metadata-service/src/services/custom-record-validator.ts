/**
 * Pure record validator + coercer for custom-module records.
 *
 * Given a module's field definitions and an incoming `data` map, this:
 *   - enforces `required` (non-empty),
 *   - coerces each supplied value to its field type (returns the coerced map),
 *   - validates PICKLIST / MULTISELECT membership against the field options,
 *   - flags obviously-malformed EMAIL / PHONE / NUMBER / DATE values,
 *   - reports which fields carry a `unique` constraint (the caller performs the
 *     DB-level uniqueness probe — this module does no IO).
 *
 * FORMULA fields are NOT accepted from input — they are computed elsewhere and
 * any client-supplied value for them is dropped.
 *
 * Pure + dependency-free; safe to unit test and reuse from routes/GraphQL.
 */

export type CustomFieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'PICKLIST'
  | 'MULTISELECT'
  | 'EMAIL'
  | 'PHONE'
  | 'CURRENCY'
  | 'FORMULA'
  | 'LOOKUP';

export const CUSTOM_FIELD_TYPES: readonly CustomFieldType[] = [
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'PICKLIST',
  'MULTISELECT',
  'EMAIL',
  'PHONE',
  'CURRENCY',
  'FORMULA',
  'LOOKUP',
] as const;

/** Minimal shape of a CustomModuleField needed for validation. */
export interface FieldDef {
  apiName: string;
  label: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  options?: unknown; // string[] | { value }[] for picklists
}

export interface FieldIssue {
  field: string;
  message: string;
}

export interface RecordValidationResult {
  valid: boolean;
  issues: FieldIssue[];
  /** The type-coerced data map (only keys with a matching field definition). */
  coerced: Record<string, unknown>;
  /** apiNames declared `unique` that carry a non-empty value in this record. */
  uniqueChecks: { apiName: string; value: unknown }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[-\d\s()]{5,}$/;

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Normalise a field's `options` JSON into a set of allowed string values. */
function optionValues(options: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(options)) return out;
  for (const opt of options) {
    if (typeof opt === 'string') out.add(opt);
    else if (opt && typeof opt === 'object') {
      const v = (opt as Record<string, unknown>).value ?? (opt as Record<string, unknown>).label;
      if (typeof v === 'string') out.add(v);
    }
  }
  return out;
}

/**
 * Validate + coerce a record's `data` against its module field defs.
 * `partial` = true (PATCH) only checks the keys present in `data`; required
 * fields absent from `data` are not re-required.
 */
export function validateCustomRecord(
  fields: FieldDef[],
  data: Record<string, unknown>,
  opts: { partial?: boolean } = {}
): RecordValidationResult {
  const partial = opts.partial === true;
  const issues: FieldIssue[] = [];
  const coerced: Record<string, unknown> = {};
  const uniqueChecks: { apiName: string; value: unknown }[] = [];

  const input = data && typeof data === 'object' && !Array.isArray(data) ? data : {};

  for (const field of fields) {
    const type = String(field.type || '').toUpperCase();
    if (type === 'FORMULA') continue; // computed, never accepted from input

    const present = Object.prototype.hasOwnProperty.call(input, field.apiName);
    const raw = present ? input[field.apiName] : undefined;

    // Required check (skip absent keys in partial mode).
    if (field.required && (!partial || present) && isEmpty(raw)) {
      issues.push({ field: field.apiName, message: `${field.label || field.apiName} is required.` });
      continue;
    }

    if (!present) continue;
    if (isEmpty(raw)) {
      coerced[field.apiName] = raw === undefined ? null : raw;
      continue;
    }

    switch (type) {
      case 'NUMBER':
      case 'CURRENCY': {
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (Number.isNaN(num) || !Number.isFinite(num)) {
          issues.push({ field: field.apiName, message: `${field.label || field.apiName} must be a number.` });
        } else {
          coerced[field.apiName] = num;
        }
        break;
      }
      case 'BOOLEAN': {
        if (typeof raw === 'boolean') coerced[field.apiName] = raw;
        else if (raw === 'true' || raw === 1 || raw === '1') coerced[field.apiName] = true;
        else if (raw === 'false' || raw === 0 || raw === '0') coerced[field.apiName] = false;
        else issues.push({ field: field.apiName, message: `${field.label || field.apiName} must be a boolean.` });
        break;
      }
      case 'DATE':
      case 'DATETIME': {
        const d = raw instanceof Date ? raw : new Date(raw as string);
        if (Number.isNaN(d.getTime())) {
          issues.push({ field: field.apiName, message: `${field.label || field.apiName} must be a valid date.` });
        } else {
          coerced[field.apiName] = d.toISOString();
        }
        break;
      }
      case 'EMAIL': {
        const s = String(raw);
        if (!EMAIL_RE.test(s)) {
          issues.push({ field: field.apiName, message: `${field.label || field.apiName} must be a valid email.` });
        } else {
          coerced[field.apiName] = s;
        }
        break;
      }
      case 'PHONE': {
        const s = String(raw);
        if (!PHONE_RE.test(s)) {
          issues.push({ field: field.apiName, message: `${field.label || field.apiName} must be a valid phone number.` });
        } else {
          coerced[field.apiName] = s;
        }
        break;
      }
      case 'PICKLIST': {
        const allowed = optionValues(field.options);
        const s = String(raw);
        if (allowed.size > 0 && !allowed.has(s)) {
          issues.push({ field: field.apiName, message: `${s} is not a valid option for ${field.label || field.apiName}.` });
        } else {
          coerced[field.apiName] = s;
        }
        break;
      }
      case 'MULTISELECT': {
        const allowed = optionValues(field.options);
        const arr = Array.isArray(raw) ? raw.map((x) => String(x)) : [String(raw)];
        const bad = allowed.size > 0 ? arr.filter((x) => !allowed.has(x)) : [];
        if (bad.length > 0) {
          issues.push({
            field: field.apiName,
            message: `${bad.join(', ')} ${bad.length === 1 ? 'is not a valid option' : 'are not valid options'} for ${field.label || field.apiName}.`,
          });
        } else {
          coerced[field.apiName] = arr;
        }
        break;
      }
      case 'LOOKUP':
      case 'TEXT':
      default: {
        coerced[field.apiName] = typeof raw === 'string' ? raw : String(raw);
        break;
      }
    }

    // Track unique constraints for the caller's DB probe (use coerced value).
    if (field.unique && field.apiName in coerced && !isEmpty(coerced[field.apiName])) {
      uniqueChecks.push({ apiName: field.apiName, value: coerced[field.apiName] });
    }
  }

  return { valid: issues.length === 0, issues, coerced, uniqueChecks };
}
