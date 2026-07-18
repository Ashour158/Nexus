// Shared, injection-safe token substitution for Custom Buttons.
//
// Replaces `{{record.field}}` (and dotted paths like `{{record.owner.name}}`)
// in a template string with values looked up from a caller-supplied record
// object. Design constraints that make it injection-safe:
//
//   • SINGLE PASS / NON-RECURSIVE — the regex scans the input once. Substituted
//     values are NEVER re-scanned, so a value that itself contains `{{...}}`
//     cannot trigger further expansion (no template-injection amplification).
//   • Values are coerced to primitive strings only. Objects/arrays resolve to
//     an empty string rather than being serialized into the output.
//   • Unknown / unresolved tokens collapse to an empty string (never left as a
//     literal `{{...}}` that a downstream system might try to interpret).
//   • Only the `record.` namespace is honoured; any other token resolves empty.
//
// The function performs pure text substitution — it does not evaluate, execute,
// or interpret the substituted values in any way.

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Safely read a dotted path (e.g. "owner.name") from a plain object. */
function readPath(root: Record<string, unknown>, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    // Guard against prototype-pollution style lookups.
    if (seg === '__proto__' || seg === 'constructor' || seg === 'prototype') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Coerce a resolved value to a safe primitive string; non-primitives → "". */
function toPrimitiveString(value: unknown): string {
  if (value === null || value === undefined) return '';
  const t = typeof value;
  if (t === 'string') return value as string;
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
  // Objects, arrays, functions, symbols are intentionally dropped.
  return '';
}

/**
 * Substitute `{{record.field}}` tokens in `template` using `record`.
 * Single-pass and non-recursive — substituted values are not re-scanned.
 *
 * @example
 *   substituteRecordTokens('Hi {{record.name}} ({{record.id}})',
 *     { name: 'Acme', id: 'lead_1' })  // → 'Hi Acme (lead_1)'
 */
export function substituteRecordTokens(
  template: string,
  record: Record<string, unknown>,
): string {
  if (typeof template !== 'string' || template.length === 0) return template ?? '';
  return template.replace(TOKEN_RE, (_match, expr: string) => {
    if (!expr.startsWith('record.')) return '';
    const path = expr.slice('record.'.length);
    if (!path) return '';
    return toPrimitiveString(readPath(record, path));
  });
}

/** Deep-ish token substitution over a JSON value (strings only are rewritten). */
export function substituteInJsonValue(
  value: unknown,
  record: Record<string, unknown>,
): unknown {
  if (typeof value === 'string') return substituteRecordTokens(value, record);
  if (Array.isArray(value)) return value.map((v) => substituteInJsonValue(v, record));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteInJsonValue(v, record);
    }
    return out;
  }
  return value;
}
