import type { MeiliSearch } from 'meilisearch';

export const LEADS_INDEX = 'leads';

/**
 * Normalize a lead domain-event payload into a Meilisearch document.
 *
 * Legacy lead events carry the id under `leadId` (not `id`), but the index
 * primaryKey is `id` — an unmapped payload is rejected with MissingDocumentId.
 * Map the legacy key → `id` and keep the searchable fields
 * (firstName/lastName/company/email/status/ownerId) plus tenantId. Tolerant of
 * missing fields.
 */
export function leadDocFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const id = payload.id ?? payload.leadId;
  if (id == null) return null;
  return { ...payload, id };
}

export async function upsertLeadDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const doc = leadDocFromPayload(payload);
  if (!doc) {
    // eslint-disable-next-line no-console
    console.warn('[search-service] skipping lead doc with no derivable id', payload);
    return;
  }
  await client.index(LEADS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
