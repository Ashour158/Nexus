import type { MeiliSearch } from 'meilisearch';

export const DEALS_INDEX = 'deals';

/**
 * Normalize a deal domain-event payload into a Meilisearch document.
 *
 * Legacy deal events carry the id under `dealId` (not `id`), but the index
 * primaryKey is `id` — so an unmapped payload is rejected with
 * MissingDocumentId (silently, inside the guarded consumer) and the deal never
 * becomes searchable. Map the legacy key → `id`, and keep the searchable
 * fields (name/amount/stageId/accountId/ownerId) plus tenantId that flow
 * through the spread. Tolerant of missing fields: whatever is present is
 * indexed, absent fields are simply omitted.
 */
export function dealDocFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const id = payload.id ?? payload.dealId;
  if (id == null) return null;
  return { ...payload, id };
}

export async function upsertDealDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const doc = dealDocFromPayload(payload);
  if (!doc) {
    // eslint-disable-next-line no-console
    console.warn('[search-service] skipping deal doc with no derivable id', payload);
    return;
  }
  await client.index(DEALS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
