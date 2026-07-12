/**
 * Advanced custom-field config validation + typing (Zoho-parity engine).
 *
 * `CustomFieldDefinition.config` is a free-form JSON blob whose required shape
 * depends on `fieldType`. These are pure, dependency-free guards (no IO) that
 * return a list of issues; empty means the config is well-formed for that type.
 *
 * Supported advanced types and their config contract:
 *   - lookup       → { lookupModule, displayField? }
 *   - multilookup  → { lookupModule, displayField?, junctionModule?, maxSelections? }
 *   - subform      → { subform: { fields: [{apiName,label,type,...}], minRows?, maxRows? } }
 *   - rollup       → { rollup: { function, childModule, childField?, linkField, filter? } }
 *   - picklist/    → may carry { controllingField } (dependent picklist) and/or
 *     multipicklist   a { globalSetId } reference to a shared GlobalPicklistSet.
 */

export const ROLLUP_FUNCTIONS = ['COUNT', 'SUM', 'MIN', 'MAX', 'AVG'] as const;
export type RollupFunction = (typeof ROLLUP_FUNCTIONS)[number];
const ROLLUP_FN_SET = new Set<string>(ROLLUP_FUNCTIONS);

/** Field types that require or accept a `config` blob. */
export const ADVANCED_FIELD_TYPES = ['lookup', 'multilookup', 'subform', 'rollup'] as const;

export interface RollupConfig {
  function: RollupFunction;
  childModule: string;
  childField?: string;
  linkField: string;
  filter?: Record<string, unknown>;
}

export interface SubformFieldDef {
  apiName: string;
  label: string;
  type: string;
  required?: boolean;
  options?: unknown[];
  defaultValue?: unknown;
}

export interface SubformConfig {
  fields: SubformFieldDef[];
  minRows?: number;
  maxRows?: number;
}

export interface FieldConfig {
  lookupModule?: string;
  displayField?: string;
  junctionModule?: string;
  maxSelections?: number;
  subform?: SubformConfig;
  rollup?: RollupConfig;
  controllingField?: string;
  globalSetId?: string;
  [key: string]: unknown;
}

export type ConfigIssue = { field: string; message: string };

const IDENTIFIER_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Pull the typed rollup config off a raw config blob, or null if absent/invalid. */
export function readRollupConfig(config: unknown): RollupConfig | null {
  const c = asObject(config);
  const raw = c ? asObject(c.rollup) : null;
  if (!raw) return null;
  if (!nonEmptyString(raw.function) || !ROLLUP_FN_SET.has(raw.function)) return null;
  if (!nonEmptyString(raw.childModule) || !nonEmptyString(raw.linkField)) return null;
  return {
    function: raw.function as RollupFunction,
    childModule: raw.childModule,
    linkField: raw.linkField,
    childField: nonEmptyString(raw.childField) ? raw.childField : undefined,
    filter: asObject(raw.filter) ?? undefined,
  };
}

/** Read a globalSetId from either the top-level column value or config.globalSetId. */
export function readGlobalSetId(config: unknown, topLevel?: string | null): string | null {
  if (nonEmptyString(topLevel)) return topLevel;
  const c = asObject(config);
  if (c && nonEmptyString(c.globalSetId)) return c.globalSetId;
  return null;
}

function validateSubform(sub: unknown, issues: ConfigIssue[]): void {
  const s = asObject(sub);
  if (!s) {
    issues.push({ field: 'config.subform', message: 'subform config object is required for subform fields.' });
    return;
  }
  if (!Array.isArray(s.fields) || s.fields.length === 0) {
    issues.push({ field: 'config.subform.fields', message: 'subform must define at least one child field.' });
  } else {
    const seen = new Set<string>();
    s.fields.forEach((f, i) => {
      const fd = asObject(f);
      if (!fd) {
        issues.push({ field: `config.subform.fields[${i}]`, message: 'each subform field must be an object.' });
        return;
      }
      if (!nonEmptyString(fd.apiName) || !IDENTIFIER_RE.test(fd.apiName)) {
        issues.push({ field: `config.subform.fields[${i}].apiName`, message: 'apiName must be a valid identifier.' });
      } else if (seen.has(fd.apiName)) {
        issues.push({ field: `config.subform.fields[${i}].apiName`, message: `duplicate subform field '${fd.apiName}'.` });
      } else {
        seen.add(fd.apiName);
      }
      if (!nonEmptyString(fd.label)) {
        issues.push({ field: `config.subform.fields[${i}].label`, message: 'label is required.' });
      }
      if (!nonEmptyString(fd.type)) {
        issues.push({ field: `config.subform.fields[${i}].type`, message: 'type is required.' });
      }
    });
  }
  const min = s.minRows;
  const max = s.maxRows;
  if (min !== undefined && (typeof min !== 'number' || !Number.isInteger(min) || min < 0)) {
    issues.push({ field: 'config.subform.minRows', message: 'minRows must be a non-negative integer.' });
  }
  if (max !== undefined && (typeof max !== 'number' || !Number.isInteger(max) || max < 1)) {
    issues.push({ field: 'config.subform.maxRows', message: 'maxRows must be a positive integer.' });
  }
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    issues.push({ field: 'config.subform.maxRows', message: 'maxRows must be >= minRows.' });
  }
}

function validateRollup(rollup: unknown, issues: ConfigIssue[]): void {
  const r = asObject(rollup);
  if (!r) {
    issues.push({ field: 'config.rollup', message: 'rollup config object is required for rollup fields.' });
    return;
  }
  if (!nonEmptyString(r.function) || !ROLLUP_FN_SET.has(r.function)) {
    issues.push({ field: 'config.rollup.function', message: `function must be one of: ${ROLLUP_FUNCTIONS.join(', ')}.` });
  }
  if (!nonEmptyString(r.childModule)) {
    issues.push({ field: 'config.rollup.childModule', message: 'childModule is required.' });
  }
  if (!nonEmptyString(r.linkField)) {
    issues.push({ field: 'config.rollup.linkField', message: 'linkField is required.' });
  }
  // Non-COUNT aggregates need a numeric child field to operate on.
  if (nonEmptyString(r.function) && r.function !== 'COUNT' && !nonEmptyString(r.childField)) {
    issues.push({ field: 'config.rollup.childField', message: `childField is required for ${r.function}.` });
  }
}

/**
 * Validate the `config` blob for a given fieldType. Returns issues (empty = ok).
 * Only enforced when a config is being supplied OR the type requires one.
 */
export function checkFieldConfig(
  fieldType: string | undefined,
  config: unknown,
  globalSetId?: string | null
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const type = String(fieldType ?? '').toLowerCase();
  const c = asObject(config);

  switch (type) {
    case 'lookup': {
      if (!c || !nonEmptyString(c.lookupModule)) {
        issues.push({ field: 'config.lookupModule', message: 'lookup fields require config.lookupModule.' });
      }
      break;
    }
    case 'multilookup': {
      if (!c || !nonEmptyString(c.lookupModule)) {
        issues.push({ field: 'config.lookupModule', message: 'multilookup fields require config.lookupModule.' });
      }
      if (c && c.maxSelections !== undefined && (typeof c.maxSelections !== 'number' || c.maxSelections < 1)) {
        issues.push({ field: 'config.maxSelections', message: 'maxSelections must be a positive number.' });
      }
      break;
    }
    case 'subform': {
      validateSubform(c?.subform, issues);
      break;
    }
    case 'rollup': {
      validateRollup(c?.rollup, issues);
      break;
    }
    default: {
      // Picklist-family: a globalSetId or controllingField may be present.
      if (c && c.controllingField !== undefined && !nonEmptyString(c.controllingField)) {
        issues.push({ field: 'config.controllingField', message: 'controllingField must be a non-empty string.' });
      }
      break;
    }
  }

  // globalSetId (top-level or in config) must be a non-empty string when present.
  const gsInConfig = c ? c.globalSetId : undefined;
  if (gsInConfig !== undefined && !nonEmptyString(gsInConfig)) {
    issues.push({ field: 'config.globalSetId', message: 'globalSetId must be a non-empty string.' });
  }
  if (globalSetId !== undefined && globalSetId !== null && !nonEmptyString(globalSetId)) {
    issues.push({ field: 'globalSetId', message: 'globalSetId must be a non-empty string.' });
  }

  return issues;
}
