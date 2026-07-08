import type { MeiliSearch } from 'meilisearch';

export const ACCOUNTS_INDEX = 'accounts';

/**
 * Normalize an account domain-event payload into a Meilisearch document.
 *
 * Legacy account events carry the id under `accountId` (not `id`), but the
 * index primaryKey is `id` — an unmapped payload is rejected with
 * MissingDocumentId. Map the legacy key → `id` and keep the searchable fields
 * (name/industry/website/ownerId) plus tenantId. Tolerant of missing fields.
 */
export function accountDocFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const id = payload.id ?? payload.accountId;
  if (id == null) return null;
  return { ...payload, id };
}

export async function upsertAccountDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const doc = accountDocFromPayload(payload);
  if (!doc) {
    // eslint-disable-next-line no-console
    console.warn('[search-service] skipping account doc with no derivable id', payload);
    return;
  }
  await client.index(ACCOUNTS_INDEX).addDocuments([doc], { primaryKey: 'id' });
}
