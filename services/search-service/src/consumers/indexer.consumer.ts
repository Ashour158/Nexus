import type { MeiliSearch } from 'meilisearch';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { upsertDealDoc } from '../indexes/deals.index.js';
import { upsertContactDoc } from '../indexes/contacts.index.js';
import { upsertAccountDoc } from '../indexes/accounts.index.js';
import { upsertLeadDoc } from '../indexes/leads.index.js';
import { upsertActivityDoc, deleteActivityDoc } from '../indexes/activities.index.js';
import { upsertQuoteDoc, deleteQuoteDoc } from '../indexes/quotes.index.js';
import { upsertKbArticleDoc, deleteKbArticleDoc, KB_ARTICLES_TOPIC } from '../indexes/kb-articles.index.js';

type IndexEvent = { tenantId: string; payload: Record<string, unknown>; type: string };

export async function startIndexerConsumer(client: MeiliSearch): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('search-service.indexer');
  // Bind to the consumer — `on` reads `this.handlers`, so a bare method
  // reference would call it with `this === undefined` and throw.
  const onUnsafe = consumer.on.bind(consumer) as unknown as (
    event: string,
    handler: (event: IndexEvent) => Promise<void>
  ) => void;

  // Guard every handler: a Meilisearch/network failure must be logged and
  // swallowed so it never crashes the consumer run loop or blocks offset
  // commits for other events. All indexing is best-effort and idempotent.
  const guard = (fn: (event: IndexEvent) => Promise<void>) => async (event: IndexEvent) => {
    try {
      await fn(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[search-service] indexing failed for event '${event.type}':`,
        err instanceof Error ? err.message : err
      );
    }
  };

  const upsertFromEvent = guard(async (event: IndexEvent) => {
    const payload = { ...event.payload, tenantId: event.tenantId };
    if (event.type.startsWith('deal.')) await upsertDealDoc(client, payload);
    if (event.type.startsWith('contact.')) await upsertContactDoc(client, payload);
    if (event.type.startsWith('account.')) await upsertAccountDoc(client, payload);
    if (event.type.startsWith('lead.')) await upsertLeadDoc(client, payload);
  });

  const upsertActivity = guard(async (event: IndexEvent) => {
    await upsertActivityDoc(client, { ...event.payload, tenantId: event.tenantId });
  });
  const removeActivity = guard(async (event: IndexEvent) => {
    await deleteActivityDoc(client, { ...event.payload, tenantId: event.tenantId });
  });

  const upsertQuote = guard(async (event: IndexEvent) => {
    await upsertQuoteDoc(client, { ...event.payload, tenantId: event.tenantId });
  });
  const removeQuote = guard(async (event: IndexEvent) => {
    await deleteQuoteDoc(client, { ...event.payload, tenantId: event.tenantId });
  });

  const upsertKbArticle = guard(async (event: IndexEvent) => {
    await upsertKbArticleDoc(client, { ...event.payload, tenantId: event.tenantId });
  });
  const removeKbArticle = guard(async (event: IndexEvent) => {
    await deleteKbArticleDoc(client, { ...event.payload, tenantId: event.tenantId });
  });

  // ─── Existing 4 entities (unchanged behavior) ──────────────────────────────
  onUnsafe('deal.created', upsertFromEvent);
  onUnsafe('deal.updated', upsertFromEvent);
  onUnsafe('deal.won', upsertFromEvent);
  onUnsafe('deal.lost', upsertFromEvent);
  onUnsafe('contact.created', upsertFromEvent);
  onUnsafe('contact.updated', upsertFromEvent);
  onUnsafe('account.created', upsertFromEvent);
  onUnsafe('account.updated', upsertFromEvent);
  onUnsafe('lead.created', upsertFromEvent);
  onUnsafe('lead.updated', upsertFromEvent);

  // ─── Activities ────────────────────────────────────────────────────────────
  onUnsafe('activity.created', upsertActivity);
  onUnsafe('activity.updated', upsertActivity);
  onUnsafe('activity.completed', upsertActivity);
  onUnsafe('activity.deleted', removeActivity);

  // ─── Quotes ────────────────────────────────────────────────────────────────
  onUnsafe('quote.created', upsertQuote);
  onUnsafe('quote.updated', upsertQuote);
  onUnsafe('quote.sent', upsertQuote);
  onUnsafe('quote.accepted', upsertQuote);
  onUnsafe('quote.rejected', upsertQuote);
  onUnsafe('quote.voided', removeQuote);

  // ─── Knowledge-base articles ───────────────────────────────────────────────
  // The knowledge-service does not (yet) emit Kafka events; when it does, these
  // handlers index/remove articles. Event/topic names are best-effort guesses
  // that match the KbArticle lifecycle (create/update/publish/delete).
  onUnsafe('kb.article.created', upsertKbArticle);
  onUnsafe('kb.article.updated', upsertKbArticle);
  onUnsafe('kb.article.published', upsertKbArticle);
  onUnsafe('kb.article.archived', upsertKbArticle);
  onUnsafe('kb.article.deleted', removeKbArticle);

  // Subscribe to the shared CRM/finance topics plus the (local) knowledge
  // topic. Subscribing to a topic that has no producer yet is harmless.
  await consumer.subscribe([
    TOPICS.DEALS,
    TOPICS.CONTACTS,
    TOPICS.ACCOUNTS,
    TOPICS.LEADS,
    TOPICS.ACTIVITIES,
    TOPICS.QUOTES,
    KB_ARTICLES_TOPIC,
  ]);
  await consumer.start();
  return consumer;
}
