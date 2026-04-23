import type { MeiliSearch } from 'meilisearch';
import { ACCOUNTS_INDEX } from './accounts.index.js';
import { CONTACTS_INDEX } from './contacts.index.js';
import { DEALS_INDEX } from './deals.index.js';
import { LEADS_INDEX } from './leads.index.js';

async function ensureIndex(client: MeiliSearch, uid: string): Promise<void> {
  const exists = await client.getIndexes({ limit: 1000 });
  if (!exists.results.some((idx) => idx.uid === uid)) {
    await client.createIndex(uid, { primaryKey: 'id' });
  }
}

export async function setupIndexes(client: MeiliSearch): Promise<void> {
  await ensureIndex(client, DEALS_INDEX);
  await ensureIndex(client, CONTACTS_INDEX);
  await ensureIndex(client, ACCOUNTS_INDEX);
  await ensureIndex(client, LEADS_INDEX);

  await client.index(DEALS_INDEX).updateSettings({
    searchableAttributes: ['name', 'accountName', 'ownerName', 'tags'],
    filterableAttributes: ['tenantId', 'status', 'stageId'],
    sortableAttributes: ['amount', 'createdAt'],
  });
  await client.index(CONTACTS_INDEX).updateSettings({
    searchableAttributes: ['firstName', 'lastName', 'email', 'phone'],
    filterableAttributes: ['tenantId'],
  });
  await client.index(ACCOUNTS_INDEX).updateSettings({
    searchableAttributes: ['name', 'website'],
    filterableAttributes: ['tenantId'],
  });
  await client.index(LEADS_INDEX).updateSettings({
    searchableAttributes: ['firstName', 'lastName', 'email', 'company'],
    filterableAttributes: ['tenantId'],
  });
}
