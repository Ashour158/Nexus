import type { MeiliSearch } from 'meilisearch';
import { INDEX_SCHEMAS } from './index-schema.js';

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

/**
 * Push searchable/filterable/sortable attribute settings for every index.
 *
 * The attribute lists come straight from INDEX_SCHEMAS — the same map the
 * runtime filter/sort builder reads — so what Meilisearch is configured to
 * allow and what a client may filter/sort on can never drift apart.
 */
export async function setupIndexes(client: MeiliSearch): Promise<void> {
  for (const [uid, schema] of Object.entries(INDEX_SCHEMAS)) {
    await setupOne(client, uid, {
      searchableAttributes: schema.searchable,
      filterableAttributes: schema.filterable,
      sortableAttributes: schema.sortable,
    });
  }
}
