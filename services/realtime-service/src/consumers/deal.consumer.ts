import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { dealRoom, tenantRoom } from '../socket/rooms.js';

export async function startDealConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.deals');

  consumer.on('deal.created', async (event) => {
    io.to(tenantRoom(event.tenantId)).emit('deal:updated', {
      type: event.type,
      payload: event.payload,
    });
  });
  consumer.on('deal.stage_changed', async (event) => {
    io.to(tenantRoom(event.tenantId)).emit('deal:updated', {
      type: event.type,
      payload: event.payload,
    });
    const payload = event.payload as unknown as { dealId?: string };
    if (payload.dealId) {
      io.to(dealRoom(payload.dealId)).emit('deal:stage_changed', event.payload);
    }
  });
  consumer.on('deal.won', async (event) => {
    io.to(tenantRoom(event.tenantId)).emit('deal:updated', {
      type: event.type,
      payload: event.payload,
    });
    const payload = event.payload as unknown as { dealId?: string };
    if (payload.dealId) {
      io.to(dealRoom(payload.dealId)).emit('deal:status_changed', event.payload);
    }
  });
  consumer.on('deal.lost', async (event) => {
    io.to(tenantRoom(event.tenantId)).emit('deal:updated', {
      type: event.type,
      payload: event.payload,
    });
    const payload = event.payload as unknown as { dealId?: string };
    if (payload.dealId) {
      io.to(dealRoom(payload.dealId)).emit('deal:status_changed', event.payload);
    }
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
