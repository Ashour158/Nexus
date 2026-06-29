import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { DealsPrisma } from '../prisma.js';
import { projectFinanceQuoteEvent } from '../services/quote-projections.service.js';

const FINANCE_QUOTE_EVENTS = [
  'quote.created',
  'quote.created_from_rfq',
  'quote.submitted_for_approval',
  'quote.approved',
  'quote.rejected',
  'quote.sent',
  'quote.signature_requested',
  'quote.signed',
  'quote.accepted',
  'quote.expired',
  'quote.voided',
  'quote.converted_to_order',
  'quote.revision_created',
];

export async function startQuoteProjectionConsumer(prisma: DealsPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('deals-service.quote-projections');

  for (const type of FINANCE_QUOTE_EVENTS) {
    consumer.on(type, async (event) => {
      await projectFinanceQuoteEvent(prisma, {
        id: typeof event.payload === 'object' && event.payload ? String((event.payload as Record<string, unknown>).eventId ?? '') : undefined,
        type: event.type,
        tenantId: event.tenantId,
        payload: event.payload as Record<string, unknown>,
      });
    });
  }

  await consumer.subscribe([TOPICS.QUOTES]);
  await consumer.start();
  return consumer;
}
