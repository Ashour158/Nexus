import type { MeiliSearch } from 'meilisearch';

export const ACTIVITIES_INDEX = 'activities';

/**
 * Normalize an activity domain-event payload into a Meilisearch document.
 *
 * Activity events carry the id under `activityId` (not `id`), but the index
 * primaryKey is `id`. Map it so the document is addressable/deletable, while
 * preserving the original fields for searching/filtering.
 */
export function activityDocFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const id = payload.id ?? payload.activityId;
  if (id == null) return null;
  return { ...payload, id };
}

export async function upsertActivityDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const doc = activityDocFromPayload(payload);
  if (!doc) return;
  await client.index(ACTIVITIES_INDEX).addDocuments([doc], { primaryKey: 'id' });
}

export async function deleteActivityDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const id = payload.id ?? payload.activityId;
  if (id == null) return;
  await client.index(ACTIVITIES_INDEX).deleteDocument(String(id));
}
