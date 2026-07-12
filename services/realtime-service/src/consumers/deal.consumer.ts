import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { dealRoom, tenantRoom } from '../socket/rooms.js';
import { buildEnvelope, emitEnvelope, type DomainEvent } from '../socket/envelope.js';

export async function startDealConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.deals');

  // Build the consistent envelope once per event (dropping tenant-less events),
  // fan it out on the canonical `deals:event` module stream, then reuse the same
  // envelope for the legacy per-record channels the web client still listens on.
  const fanOut = (event: DomainEvent): { dealId: string; envelope: ReturnType<typeof buildEnvelope> } => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const dealId = typeof payload.dealId === 'string' ? payload.dealId : '';
    const envelope = buildEnvelope('deals', event, dealId || undefined);
    emitEnvelope(io, envelope);
    return { dealId, envelope };
  };

  consumer.on('deal.created', async (event) => {
    const { envelope } = fanOut(event);
    if (!envelope) return;
    io.to(tenantRoom(envelope.tenantId)).emit('deal:updated', envelope);
  });
  consumer.on('deal.stage_changed', async (event) => {
    const { dealId, envelope } = fanOut(event);
    if (!envelope) return;
    io.to(tenantRoom(envelope.tenantId)).emit('deal:updated', envelope);
    if (dealId) {
      io.to(dealRoom(dealId)).emit('deal:stage_changed', envelope);
    }
  });
  consumer.on('deal.won', async (event) => {
    const { dealId, envelope } = fanOut(event);
    if (!envelope) return;
    io.to(tenantRoom(envelope.tenantId)).emit('deal:updated', envelope);
    if (dealId) {
      io.to(dealRoom(dealId)).emit('deal:status_changed', envelope);
    }
  });
  consumer.on('deal.lost', async (event) => {
    const { dealId, envelope } = fanOut(event);
    if (!envelope) return;
    io.to(tenantRoom(envelope.tenantId)).emit('deal:updated', envelope);
    if (dealId) {
      io.to(dealRoom(dealId)).emit('deal:status_changed', envelope);
    }
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
