import type { MeiliSearch } from 'meilisearch';

export const DEALS_INDEX = 'deals';

export async function upsertDealDoc(client: MeiliSearch, doc: Record<string, unknown>) {
  await client.index(DEALS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
