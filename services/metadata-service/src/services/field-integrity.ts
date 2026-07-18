/**
 * Pure integrity guards for CustomFieldDefinition create/update.
 *
 * These are deterministic, dependency-free checks that run BEFORE we touch the
 * database, giving callers a clean 422 with a specific reason instead of a raw
 * Prisma error (or a silently-accepted bad definition). None of these guards
 * perform I/O — the caller is responsible for the DB-level uniqueness check.
 */

import { checkFieldConfig } from './field-config.js';

/** Field types the platform can render + store. Unknown types are rejected. */
export const ALLOWED_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'currency',
  'percent',
  'boolean',
  'date',
  'datetime',
  'email',
  'phone',
  'url',
  'picklist',
  'multipicklist',
  'lookup',
  // Advanced Zoho-parity types (config carried in CustomFieldDefinition.config):
  'multilookup', // references many records in another module
  'subform', // repeating child line-item grid
  'rollup', // read-only aggregate of a related set (ROLLUP_SUMMARY)
  'user',
] as const;

export type AllowedFieldType = (typeof ALLOWED_FIELD_TYPES)[number];

const FIELD_TYPE_SET = new Set<string>(ALLOWED_FIELD_TYPES);

/**
 * Reserved api keys that would collide with core record columns / framework
 * semantics. A custom field may not shadow any of these.
 */
export const RESERVED_API_KEYS = new Set<string>([
  'id',
  'tenantid',
  'tenant_id',
  'createdat',
  'created_at',
  'updatedat',
  'updated_at',
  'deletedat',
  'deleted_at',
  'createdby',
  'updatedby',
  'ownerid',
  'owner_id',
  'type',
  'status',
  '__proto__',
  'constructor',
  'prototype',
]);

/** apiKey must be a safe identifier: starts with a letter, then letters/digits/underscore. */
const API_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export type FieldIntegrityIssue = { field: string; message: string };

export type FieldDefinitionCandidate = {
  apiKey?: unknown;
  fieldType?: unknown;
  name?: unknown;
  options?: unknown;
  config?: unknown;
  globalSetId?: unknown;
};

/**
 * Validate a field definition candidate. Returns a list of issues; empty means
 * it passed. `partial` = true skips checks for absent keys (for PATCH/update).
 */
export function checkFieldDefinition(
  candidate: FieldDefinitionCandidate,
  opts: { partial?: boolean } = {}
): FieldIntegrityIssue[] {
  const issues: FieldIntegrityIssue[] = [];
  const partial = opts.partial === true;

  const hasApiKey = candidate.apiKey !== undefined;
  if (hasApiKey || !partial) {
    const apiKey = typeof candidate.apiKey === 'string' ? candidate.apiKey : '';
    if (!apiKey) {
      issues.push({ field: 'apiKey', message: 'apiKey is required.' });
    } else if (!API_KEY_RE.test(apiKey)) {
      issues.push({
        field: 'apiKey',
        message: 'apiKey must start with a letter and contain only letters, digits, or underscores.',
      });
    } else if (RESERVED_API_KEYS.has(apiKey.toLowerCase())) {
      issues.push({ field: 'apiKey', message: `apiKey '${apiKey}' is reserved and cannot be used.` });
    }
  }

  const hasFieldType = candidate.fieldType !== undefined;
  if (hasFieldType || !partial) {
    const fieldType = typeof candidate.fieldType === 'string' ? candidate.fieldType : '';
    if (!fieldType) {
      issues.push({ field: 'fieldType', message: 'fieldType is required.' });
    } else if (!FIELD_TYPE_SET.has(fieldType)) {
      issues.push({
        field: 'fieldType',
        message: `fieldType '${fieldType}' is not supported. Allowed: ${ALLOWED_FIELD_TYPES.join(', ')}.`,
      });
    }
  }

  // Picklist-family fields should carry at least one option (only checked when
  // options are being supplied, so a later PATCH can add them).
  const effectiveType = typeof candidate.fieldType === 'string' ? candidate.fieldType : undefined;
  // A picklist backed by a GlobalPicklistSet (or a dependent picklist that
  // resolves its options from a controlling field) is allowed to have no inline
  // options, so only enforce the "at least one option" rule for standalone
  // picklists that supply an (empty) options array and no globalSet reference.
  const gsRef =
    (typeof candidate.globalSetId === 'string' && candidate.globalSetId.length > 0) ||
    (candidate.config !== null &&
      typeof candidate.config === 'object' &&
      typeof (candidate.config as Record<string, unknown>).globalSetId === 'string');
  if (
    (effectiveType === 'picklist' || effectiveType === 'multipicklist') &&
    !gsRef &&
    candidate.options !== undefined &&
    Array.isArray(candidate.options) &&
    candidate.options.length === 0
  ) {
    issues.push({ field: 'options', message: 'picklist fields must define at least one option.' });
  }

  // Advanced type-specific config (lookup/multilookup/subform/rollup) + global
  // set references. Only run when the type is known and a config is relevant.
  if (effectiveType !== undefined) {
    if (
      candidate.config !== undefined ||
      candidate.globalSetId !== undefined ||
      effectiveType === 'lookup' ||
      effectiveType === 'multilookup' ||
      effectiveType === 'subform' ||
      effectiveType === 'rollup'
    ) {
      const configIssues = checkFieldConfig(
        effectiveType,
        candidate.config,
        typeof candidate.globalSetId === 'string' ? candidate.globalSetId : null
      );
      issues.push(...configIssues);
    }
  }

  return issues;
}

/** True when `apiKey` is a well-formed, non-reserved identifier. */
export function isValidApiKey(apiKey: string): boolean {
  return API_KEY_RE.test(apiKey) && !RESERVED_API_KEYS.has(apiKey.toLowerCase());
}
