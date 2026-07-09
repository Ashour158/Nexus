import type { MeiliSearch } from 'meilisearch';
import { ACCOUNTS_INDEX } from './accounts.index.js';
import { CONTACTS_INDEX } from './contacts.index.js';
import { DEALS_INDEX } from './deals.index.js';
import { LEADS_INDEX } from './leads.index.js';
import { ACTIVITIES_INDEX } from './activities.index.js';
import { QUOTES_INDEX } from './quotes.index.js';
import { KB_ARTICLES_INDEX } from './kb-articles.index.js';

async function ensureIndex(client: MeiliSearch, uid: string): Promise<void> {
  const exists = await client.getIndexes({ limit: 1000 });
  if (!exists.results.some((idx) => idx.uid === uid)) {
    await client.createIndex(uid, { primaryKey: 'id' });
  }
}

/**
 * Set up a single index's settings, guarded so one broken index (or a
 * transiently-unavailable Meilisearch) does not prevent the others from being
 * created. Failures are logged and swallowed; search degrades gracefully.
 */
async function setupOne(
  client: MeiliSearch,
  uid: string,
  settings: Parameters<ReturnType<MeiliSearch['index']>['updateSettings']>[0]
): Promise<void> {
  try {
    await ensureIndex(client, uid);
    await client.index(uid).updateSettings(settings);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[search-service] failed to set up index '${uid}':`, err instanceof Error ? err.message : err);
  }
}

export async function setupIndexes(client: MeiliSearch): Promise<void> {
  await setupOne(client, DEALS_INDEX, {
    searchableAttributes: ['name', 'accountName', 'ownerName', 'tags'],
    filterableAttributes: ['tenantId', 'status', 'stageId'],
    sortableAttributes: ['amount', 'createdAt'],
  });
  await setupOne(client, CONTACTS_INDEX, {
    searchableAttributes: ['firstName', 'lastName', 'email', 'phone'],
    filterableAttributes: ['tenantId'],
  });
  await setupOne(client, ACCOUNTS_INDEX, {
    searchableAttributes: ['name', 'website'],
    filterableAttributes: ['tenantId'],
  });
  await setupOne(client, LEADS_INDEX, {
    searchableAttributes: ['firstName', 'lastName', 'email', 'company'],
    filterableAttributes: ['tenantId'],
  });

  // ─── New entities (additive) ───────────────────────────────────────────────
  await setupOne(client, ACTIVITIES_INDEX, {
    searchableAttributes: ['subject', 'type', 'outcome', 'notes', 'description'],
    filterableAttributes: ['tenantId', 'type', 'ownerId', 'dealId', 'contactId', 'leadId'],
    sortableAttributes: ['dueDate', 'createdAt'],
  });
  await setupOne(client, QUOTES_INDEX, {
    searchableAttributes: ['quoteNumber', 'name', 'accountName', 'status'],
    filterableAttributes: ['tenantId', 'status', 'dealId', 'accountId'],
    sortableAttributes: ['total', 'createdAt'],
  });
  await setupOne(client, KB_ARTICLES_INDEX, {
    searchableAttributes: ['title', 'body', 'slug', 'tags'],
    filterableAttributes: ['tenantId', 'status', 'dealStages', 'categoryId'],
    sortableAttributes: ['updatedAt', 'viewCount'],
  });
}
