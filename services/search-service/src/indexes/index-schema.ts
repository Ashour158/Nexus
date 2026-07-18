import { ACCOUNTS_INDEX } from './accounts.index.js';
import { CONTACTS_INDEX } from './contacts.index.js';
import { DEALS_INDEX } from './deals.index.js';
import { LEADS_INDEX } from './leads.index.js';
import { ACTIVITIES_INDEX } from './activities.index.js';
import { QUOTES_INDEX } from './quotes.index.js';
import { KB_ARTICLES_INDEX } from './kb-articles.index.js';

/**
 * Single source of truth for each Meilisearch index's attribute settings.
 *
 * Both `setupIndexes` (which pushes these to Meilisearch) and the runtime filter
 * / sort builder read from this map, so the set of attributes a client may
 * filter or sort on can never drift from what Meilisearch is actually
 * configured to allow. Adding a field here (and only here) makes it both
 * queryable and configured.
 *
 * `tenantId` is filterable on every index — tenant scoping is mandatory and
 * always AND-ed into the filter, never client-controlled.
 *
 * `createdAtTs` / `updatedAtTs` are numeric (epoch-ms) mirrors of the ISO
 * `createdAt` / `updatedAt` fields, derived at index time (see doc-meta.ts).
 * Meilisearch range filters (`>=` / `<=`) require numeric values, so date-range
 * filtering targets these numeric mirrors rather than the ISO strings.
 */
export interface IndexSchema {
  searchable: string[];
  filterable: string[];
  sortable: string[];
}

export const INDEX_SCHEMAS: Record<string, IndexSchema> = {
  [DEALS_INDEX]: {
    searchable: ['name', 'accountName', 'ownerName', 'tags'],
    filterable: ['tenantId', 'status', 'stageId', 'ownerId', 'accountId', 'createdAtTs'],
    sortable: ['amount', 'createdAt', 'createdAtTs'],
  },
  [CONTACTS_INDEX]: {
    searchable: ['firstName', 'lastName', 'email', 'phone'],
    filterable: ['tenantId', 'ownerId', 'accountId', 'createdAtTs'],
    sortable: ['createdAtTs'],
  },
  [ACCOUNTS_INDEX]: {
    searchable: ['name', 'website'],
    filterable: ['tenantId', 'ownerId', 'createdAtTs'],
    sortable: ['createdAtTs'],
  },
  [LEADS_INDEX]: {
    searchable: ['firstName', 'lastName', 'email', 'company'],
    filterable: ['tenantId', 'status', 'ownerId', 'createdAtTs'],
    sortable: ['createdAtTs'],
  },
  [ACTIVITIES_INDEX]: {
    searchable: ['subject', 'type', 'outcome', 'notes', 'description'],
    filterable: ['tenantId', 'type', 'ownerId', 'dealId', 'contactId', 'leadId', 'accountId', 'createdAtTs'],
    sortable: ['dueDate', 'createdAt', 'createdAtTs'],
  },
  [QUOTES_INDEX]: {
    searchable: ['quoteNumber', 'name', 'accountName', 'status'],
    filterable: ['tenantId', 'status', 'dealId', 'accountId', 'ownerId', 'createdAtTs'],
    sortable: ['total', 'createdAt', 'createdAtTs'],
  },
  [KB_ARTICLES_INDEX]: {
    searchable: ['title', 'body', 'slug', 'tags'],
    filterable: ['tenantId', 'status', 'dealStages', 'categoryId', 'createdAtTs'],
    sortable: ['updatedAt', 'viewCount', 'updatedAtTs'],
  },
};

/** Fields a caller may filter on for a given index (excludes the mandatory tenantId gate). */
export function filterableFields(indexUid: string): Set<string> {
  return new Set(INDEX_SCHEMAS[indexUid]?.filterable ?? []);
}

/** Fields a caller may sort on for a given index. */
export function sortableFields(indexUid: string): Set<string> {
  return new Set(INDEX_SCHEMAS[indexUid]?.sortable ?? []);
}

/** Union of every sortable field across all indexes (for global validation). */
export const ALL_SORTABLE_FIELDS: Set<string> = new Set(
  Object.values(INDEX_SCHEMAS).flatMap((s) => s.sortable)
);
