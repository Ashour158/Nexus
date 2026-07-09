import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { accountRoom, contactRoom, dealRoom, tenantRoom } from '../socket/rooms.js';

function emitQuoteEvent(
  io: Server,
  eventNames: { contact: string; account: string; deal?: string },
  event: { type: string; tenantId: string; payload: unknown }
): void {
  const payload = event.payload as Record<string, unknown>;
  const contactId = typeof payload.contactId === 'string' ? payload.contactId : '';
  const accountId = typeof payload.accountId === 'string' ? payload.accountId : '';
  const dealId = typeof payload.dealId === 'string' ? payload.dealId : '';
  io.to(tenantRoom(event.tenantId)).emit('contact:commercial_updated', {
    type: event.type,
    payload,
  });
  io.to(tenantRoom(event.tenantId)).emit('account:commercial_updated', {
    type: event.type,
    payload,
  });
  if (contactId) {
    io.to(contactRoom(contactId)).emit(eventNames.contact, {
      type: event.type,
      payload,
    });
  }
  if (accountId) {
    io.to(accountRoom(accountId)).emit(eventNames.account, {
      type: event.type,
      payload,
    });
  }
  if (dealId) {
    io.to(dealRoom(dealId)).emit(eventNames.deal ?? 'deal:commercial_updated', {
      type: event.type,
      payload,
    });
  }
}

export async function startQuoteConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.quotes');

  consumer.on('quote.created', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_created', account: 'account:quote_created' }, event);
  });
  consumer.on('quote.sent', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_updated', account: 'account:quote_updated' }, event);
  });
  consumer.on('quote.accepted', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_updated', account: 'account:quote_updated' }, event);
  });
  consumer.on('quote.rejected', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_updated', account: 'account:quote_updated' }, event);
  });
  consumer.on('quote.voided', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_updated', account: 'account:quote_updated' }, event);
  });
  consumer.on('quote.updated', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_updated', account: 'account:quote_updated' }, event);
  });
  consumer.on('quote.duplicated', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_created', account: 'account:quote_created' }, event);
  });
  consumer.on('quote.discount_request.created', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:drq_created', account: 'account:drq_created', deal: 'deal:drq_created' }, event);
  });
  consumer.on('rfq.created', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:rfq_created', account: 'account:rfq_created', deal: 'deal:rfq_created' }, event);
  });
  for (const eventType of ['rfq.submitted_for_review', 'rfq.review_started', 'rfq.returned', 'rfq.ready_for_quote', 'rfq.responded', 'rfq.cancelled', 'rfq.sent']) {
    consumer.on(eventType, async (event) => {
      emitQuoteEvent(io, { contact: 'contact:rfq_updated', account: 'account:rfq_updated', deal: 'deal:rfq_updated' }, event);
    });
  }
  consumer.on('rfq.converted_to_quote', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:rfq_converted', account: 'account:rfq_converted', deal: 'deal:rfq_converted' }, event);
  });
  consumer.on('rfq.converted', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:rfq_converted', account: 'account:rfq_converted', deal: 'deal:rfq_converted' }, event);
  });
  consumer.on('order.created', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:order_created', account: 'account:order_created', deal: 'deal:order_created' }, event);
  });
  consumer.on('quote.converted_to_order', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:order_created', account: 'account:order_created', deal: 'deal:order_created' }, event);
  });
  consumer.on('quote.document.rendered', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_document_rendered', account: 'account:quote_document_rendered', deal: 'deal:quote_document_rendered' }, event);
  });
  consumer.on('quote.esign.sent', async (event) => {
    emitQuoteEvent(io, { contact: 'contact:quote_esign_updated', account: 'account:quote_esign_updated', deal: 'deal:quote_esign_updated' }, event);
  });
  for (const status of ['viewed', 'signed', 'declined', 'voided', 'expired']) {
    consumer.on(`quote.esign.${status}`, async (event) => {
      emitQuoteEvent(io, { contact: 'contact:quote_esign_updated', account: 'account:quote_esign_updated', deal: 'deal:quote_esign_updated' }, event);
    });
  }

  await consumer.subscribe([TOPICS.QUOTES]);
  await consumer.start();
  return consumer;
}
