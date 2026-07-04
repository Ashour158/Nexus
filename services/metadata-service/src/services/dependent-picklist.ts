/**
 * Dependent (cascading) picklists.
 *
 * There is no dedicated Picklist/Option table in this service — picklist values
 * live in `CustomFieldDefinition.options` as a JSON array. To support
 * controlling-field → dependent-values cascades WITHOUT a schema change, an
 * option object MAY carry a `controllingValues` array:
 *
 *   {
 *     "value": "san_francisco",
 *     "label": "San Francisco",
 *     "controllingValues": ["US", "USA"]   // parent (e.g. Country) values that reveal this child
 *   }
 *
 * Filtering rules (all FAIL-OPEN):
 *   - An option with no `controllingValues` (missing or empty) is ALWAYS available.
 *   - When a `controllingValue` is supplied, an option that declares
 *     `controllingValues` is available iff that array includes the value
 *     (case-insensitive, string-compared).
 *   - When NO `controllingValue` is supplied, only unconditional options are
 *     returned (a dependent child has nothing to depend on).
 *   - Malformed option entries are skipped, never thrown on.
 */

export type PicklistOption = {
  value: string;
  label?: string;
  controllingValues?: string[];
  [key: string]: unknown;
};

export type DependentOptionsResult = {
  controllingValue: string | null;
  total: number;
  options: PicklistOption[];
};

function normalize(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : String(v ?? '').trim().toLowerCase();
}

/** Coerce a raw JSON options blob into a clean, typed option list. */
function coerceOptions(raw: unknown): PicklistOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PicklistOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const value =
      typeof o.value === 'string'
        ? o.value
        : typeof o.value === 'number' || typeof o.value === 'boolean'
          ? String(o.value)
          : undefined;
    if (value === undefined) continue;
    const controllingValues = Array.isArray(o.controllingValues)
      ? o.controllingValues.filter((x): x is string => typeof x === 'string')
      : undefined;
    out.push({
      ...(o as Record<string, unknown>),
      value,
      label: typeof o.label === 'string' ? o.label : value,
      ...(controllingValues ? { controllingValues } : {}),
    });
  }
  return out;
}

/**
 * Filter a field's raw options blob by a controlling (parent) value.
 * Pure + total: never throws.
 */
export function filterDependentOptions(
  rawOptions: unknown,
  controllingValue: string | null | undefined
): DependentOptionsResult {
  const all = coerceOptions(rawOptions);
  const parent = controllingValue == null || controllingValue === '' ? null : String(controllingValue);
  const parentNorm = parent === null ? null : normalize(parent);

  const options = all.filter((opt) => {
    const cv = opt.controllingValues;
    // Unconditional option => always available.
    if (!cv || cv.length === 0) return true;
    // Dependent option, but no parent selected => hide it.
    if (parentNorm === null) return false;
    return cv.some((c) => normalize(c) === parentNorm);
  });

  return { controllingValue: parent, total: options.length, options };
}
