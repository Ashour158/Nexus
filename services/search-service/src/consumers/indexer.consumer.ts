import type { MeiliSearch } from 'meilisearch';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { upsertDealDoc } from '../indexes/deals.index.js';
import { upsertContactDoc } from '../indexes/contacts.index.js';
import { upsertAccountDoc } from '../indexes/accounts.index.js';
import { upsertLeadDoc } from '../indexes/leads.index.js';

export async function startIndexerConsumer(client: MeiliSearch): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('search-service.indexer');
  const onUnsafe = consumer.on as unknown as (
    event: string,
    handler: (event: { tenantId: string; payload: Record<string, unknown>; type: string }) => Promise<void>
  ) => void;

  const upsertFromEvent = async (event: { tenantId: string; payload: Record<string, unknown>; type: string }) => {
    const payload = { ...event.payload, tenantId: event.tenantId };
    if (event.type.startsWith('deal.')) await upsertDealDoc(client, payload);
    if (event.type.startsWith('contact.')) await upsertContactDoc(client, payload);
    if (event.type.startsWith('account.')) await upsertAccountDoc(client, payload);
    if (event.type.startsWith('lead.')) await upsertLeadDoc(client, payload);
  };

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

  await consumer.subscribe([TOPICS.DEALS, TOPICS.CONTACTS, TOPICS.ACCOUNTS, TOPICS.LEADS]);
  await consumer.start();
  return consumer;
}
