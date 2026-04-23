import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { dealRoom } from '../socket/rooms.js';

export async function startActivityConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.activities');

  consumer.on('activity.created', async (event) => {
    const dealId = (event.payload as unknown as { dealId?: string }).dealId;
    if (!dealId) return;
    io.to(dealRoom(dealId)).emit('activity:updated', {
      type: event.type,
      payload: event.payload,
    });
  });

  consumer.on('activity.completed', async (event) => {
    const dealId = (event.payload as unknown as { dealId?: string }).dealId;
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
