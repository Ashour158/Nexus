import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { contactRoom, dealRoom } from '../socket/rooms.js';
import { buildEnvelope, emitEnvelope, type DomainEvent, type RealtimeEnvelope } from '../socket/envelope.js';

function emitContactActivity(io: Server, eventName: string, envelope: RealtimeEnvelope): void {
  const contactId = typeof envelope.payload.contactId === 'string' ? envelope.payload.contactId : '';
  if (!contactId) return;
  io.to(contactRoom(contactId)).emit(eventName, envelope);
}

export async function startActivityConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.activities');

  const handle = (contactEvent: string) =>
    async (event: DomainEvent) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const activityId = typeof payload.activityId === 'string' ? payload.activityId : '';
      const envelope = buildEnvelope('activities', event, activityId || undefined);
      if (!envelope) return;
      emitEnvelope(io, envelope);
      emitContactActivity(io, contactEvent, envelope);
      const dealId = typeof payload.dealId === 'string' ? payload.dealId : '';
      if (dealId) {
        io.to(dealRoom(dealId)).emit('activity:updated', envelope);
      }
    };

  consumer.on('activity.created', handle('contact:activity_created'));
  consumer.on('activity.completed', handle('contact:activity_updated'));

  await consumer.subscribe([TOPICS.ACTIVITIES]);
  await consumer.start();
  return consumer;
}
