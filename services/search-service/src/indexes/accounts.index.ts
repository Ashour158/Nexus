import type { MeiliSearch } from 'meilisearch';

export const ACCOUNTS_INDEX = 'accounts';

export async function upsertAccountDoc(client: MeiliSearch, doc: Record<string, unknown>) {
  await client.index(ACCOUNTS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
