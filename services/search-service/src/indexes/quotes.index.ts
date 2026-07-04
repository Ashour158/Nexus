import type { MeiliSearch } from 'meilisearch';

export const QUOTES_INDEX = 'quotes';

/**
 * Normalize a quote domain-event payload into a Meilisearch document.
 *
 * Quote events carry the id under `quoteId` (not `id`), but the index
 * primaryKey is `id`. Map it so the document is addressable/deletable, while
 * preserving the original fields for searching/filtering.
 */
export function quoteDocFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const id = payload.id ?? payload.quoteId;
  if (id == null) return null;
  return { ...payload, id };
}

export async function upsertQuoteDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const doc = quoteDocFromPayload(payload);
  if (!doc) return;
  await client.index(QUOTES_INDEX).addDocuments([doc], { primaryKey: 'id' });
}

export async function deleteQuoteDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const id = payload.id ?? payload.quoteId;
  if (id == null) return;
  await client.index(QUOTES_INDEX).deleteDocument(String(id));
}
