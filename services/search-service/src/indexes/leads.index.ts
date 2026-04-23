import type { MeiliSearch } from 'meilisearch';

export const LEADS_INDEX = 'leads';

export async function upsertLeadDoc(client: MeiliSearch, doc: Record<string, unknown>) {
  await client.index(LEADS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
