import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { contactRoom, dealRoom } from '../socket/rooms.js';

function emitContactActivity(io: Server, eventName: string, payload: Record<string, unknown>, type: string): void {
  const contactId = typeof payload.contactId === 'string' ? payload.contactId : '';
  if (!contactId) return;
  io.to(contactRoom(contactId)).emit(eventName, { type, payload });
}

export async function startActivityConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.activities');

  consumer.on('activity.created', async (event) => {
    const payload = event.payload as Record<string, unknown>;
    const dealId = typeof payload.dealId === 'string' ? payload.dealId : '';
    emitContactActivity(io, 'contact:activity_created', payload, event.type);
    if (!dealId) return;
    io.to(dealRoom(dealId)).emit('activity:updated', {
      type: event.type,
      payload: event.payload,
    });
  });

  consumer.on('activity.completed', async (event) => {
    const payload = event.payload as Record<string, unknown>;
    const dealId = typeof payload.dealId === 'string' ? payload.dealId : '';
    emitContactActivity(io, 'contact:activity_updated', payload, event.type);
    if (!dealId) return;
    io.to(dealRoom(dealId)).emit('activity:updated', {
      type: event.type,
      payload: event.payload,
    });
  });

  await consumer.subscribe([TOPICS.ACTIVITIES]);
  await consumer.start();
  return consumer;
}
