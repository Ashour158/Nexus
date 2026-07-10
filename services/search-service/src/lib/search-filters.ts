import { z } from 'zod';
import { ValidationError } from '@nexus/service-utils';
import { filterableFields, sortableFields, ALL_SORTABLE_FIELDS } from '../indexes/index-schema.js';

/**
 * Client-supplied filter/sort parameters for `/search`.
 *
 * All entries are optional and additive: a request that supplies none behaves
 * exactly as before (tenant-scoped only). Each accepted filter maps to a
 * documented Meilisearch attribute and is ALWAYS AND-ed with the mandatory
 * `tenantId` scope — a client filter can never replace or escape tenant scoping.
 *
 * `type` is intentionally NOT a filter here: on `/search` it selects which
 * entity indexes to query. The activity "type" field is exposed as
 * `activityType` to avoid that collision.
 */
export const FilterQuerySchema = z.object({
  status: z.string().min(1).max(100).optional(),
  // `stage` is an alias for `stageId` (deals).
  stage: z.string().min(1).max(100).optional(),
  stageId: z.string().min(1).max(100).optional(),
  ownerId: z.string().min(1).max(100).optional(),
  activityType: z.string().min(1).max(100).optional(),
  accountId: z.string().min(1).max(100).optional(),
  dealId: z.string().min(1).max(100).optional(),
  contactId: z.string().min(1).max(100).optional(),
  leadId: z.string().min(1).max(100).optional(),
  categoryId: z.string().min(1).max(100).optional(),
  // ISO-8601 date-range over createdAt (translated to the numeric createdAtTs mirror).
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  sortBy: z.string().min(1).max(60).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type FilterQuery = z.infer<typeof FilterQuerySchema>;

/**
 * Escape a value for safe interpolation into a Meilisearch filter string
 * literal. Meilisearch string literals are single-quoted; a literal backslash or
 * single-quote must be backslash-escaped. Applied even to JWT-derived values
 * (e.g. tenantId) so the filter can never be broken out of.
 */
export function escapeMeiliValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Equality filter param name → Meilisearch attribute it targets. */
const EQ_FIELD_BY_PARAM: Record<string, string> = {
  status: 'status',
  stage: 'stageId',
  stageId: 'stageId',
  ownerId: 'ownerId',
  activityType: 'type',
  accountId: 'accountId',
  dealId: 'dealId',
  contactId: 'contactId',
  leadId: 'leadId',
  categoryId: 'categoryId',
};

/**
 * Build the Meilisearch `filter` string for a single index.
 *
 * The mandatory `tenantId` scope is ALWAYS the first clause and is always
 * AND-ed with any client filters. A client filter is only applied when the
 * target attribute is filterable on THIS index (per INDEX_SCHEMAS); attributes
 * an index does not carry are silently skipped for that index (so, e.g.,
 * `status` filters deals/leads/quotes but is ignored for contacts). This keeps
 * the unified multi-index query from erroring on indexes that lack the field
 * while never widening tenant scope.
 */
export function buildIndexFilter(
  indexUid: string,
  tenantId: string,
  filters: FilterQuery
): string {
  const fields = filterableFields(indexUid);
  const clauses: string[] = [`tenantId = '${escapeMeiliValue(tenantId)}'`];

  for (const [param, field] of Object.entries(EQ_FIELD_BY_PARAM)) {
    const raw = (filters as Record<string, unknown>)[param];
    if (typeof raw === 'string' && raw.length > 0 && fields.has(field)) {
      clauses.push(`${field} = '${escapeMeiliValue(raw)}'`);
    }
  }

  // Date range → numeric createdAtTs mirror (only where the index carries it).
  if (fields.has('createdAtTs')) {
    if (filters.createdFrom) {
      const ms = Date.parse(filters.createdFrom);
      if (Number.isFinite(ms)) clauses.push(`createdAtTs >= ${ms}`);
    }
    if (filters.createdTo) {
      const ms = Date.parse(filters.createdTo);
      if (Number.isFinite(ms)) clauses.push(`createdAtTs <= ${ms}`);
    }
  }

  return clauses.join(' AND ');
}

/**
 * Validate a requested `sortBy` against the sortable-attribute whitelist and
 * throw a 400 (ValidationError) on an unrecognised field rather than silently
 * ignoring it. When `indexUids` is given the field must be sortable on at least
 * one of those indexes; otherwise it is checked against the global union.
 */
export function assertSortable(sortBy: string | undefined, indexUids?: string[]): void {
  if (!sortBy) return;
  const allowed = indexUids
    ? new Set(indexUids.flatMap((uid) => [...sortableFields(uid)]))
    : ALL_SORTABLE_FIELDS;
  if (!allowed.has(sortBy)) {
    throw new ValidationError('Invalid sortBy', {
      sortBy,
      allowed: [...allowed].sort(),
    });
  }
}

/**
 * Build the Meilisearch `sort` array for a single index, or `undefined` when no
 * sort was requested or the field is not sortable on this index (so the key is
 * omitted entirely and default relevance ranking applies).
 */
export function buildIndexSort(
  indexUid: string,
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc'
): string[] | undefined {
  if (!sortBy) return undefined;
  if (!sortableFields(indexUid).has(sortBy)) return undefined;
  return [`${sortBy}:${sortOrder}`];
}
