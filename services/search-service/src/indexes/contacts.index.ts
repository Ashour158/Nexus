import type { MeiliSearch } from 'meilisearch';

export const CONTACTS_INDEX = 'contacts';

/**
 * Normalize a contact domain-event payload into a Meilisearch document.
 *
 * Legacy contact events carry the id under `contactId` (not `id`), but the
 * index primaryKey is `id` — an unmapped payload is rejected with
 * MissingDocumentId. Map the legacy key → `id` and keep the searchable fields
 * (firstName/lastName/email/accountId/ownerId) plus tenantId. Tolerant of
 * missing fields.
 */
export function contactDocFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const id = payload.id ?? payload.contactId;
  if (id == null) return null;
  return { ...payload, id };
}

export async function upsertContactDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const doc = contactDocFromPayload(payload);
  if (!doc) {
    // eslint-disable-next-line no-console
    console.warn('[search-service] skipping contact doc with no derivable id', payload);
    return;
  }
  await client.index(CONTACTS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
