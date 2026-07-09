import type { MeiliSearch } from 'meilisearch';

export const KB_ARTICLES_INDEX = 'kb_articles';

/**
 * Local topic for knowledge-service article events. The shared @nexus/kafka
 * TOPICS map does not (yet) define a knowledge topic, and this service may not
 * edit outside its own tree, so the topic name is declared here. If/when the
 * knowledge-service starts emitting `kb.article.*` events on this topic, the
 * indexer will pick them up automatically; until then the consumer simply
 * receives nothing (guarded, no crash).
 */
export const KB_ARTICLES_TOPIC = 'nexus.knowledge.articles';

/**
 * Normalize a knowledge-article domain-event payload into a Meilisearch
 * document. Article events may carry the id under `articleId` or `id`; the
 * index primaryKey is `id`, so map it while preserving searchable/filterable
 * fields (title/body/slug/status/dealStages/tags).
 */
export function kbArticleDocFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const id = payload.id ?? payload.articleId;
  if (id == null) return null;
  return { ...payload, id };
}

export async function upsertKbArticleDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const doc = kbArticleDocFromPayload(payload);
  if (!doc) return;
  await client.index(KB_ARTICLES_INDEX).addDocuments([doc], { primaryKey: 'id' });
}

export async function deleteKbArticleDoc(client: MeiliSearch, payload: Record<string, unknown>) {
  const id = payload.id ?? payload.articleId;
  if (id == null) return;
  await client.index(KB_ARTICLES_INDEX).deleteDocument(String(id));
}
