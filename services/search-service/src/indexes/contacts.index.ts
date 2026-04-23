import type { MeiliSearch } from 'meilisearch';

export const CONTACTS_INDEX = 'contacts';

export async function upsertContactDoc(client: MeiliSearch, doc: Record<string, unknown>) {
  await client.index(CONTACTS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
