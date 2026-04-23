import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { userRoom } from '../socket/rooms.js';

interface NotificationPayload {
  userId?: string;
  unreadCount?: number;
}

export async function startNotificationConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.notifications');

  const onUnsafe = consumer.on as unknown as (
    event: string,
    handler: (event: { payload: unknown }) => Promise<void>
  ) => void;

  onUnsafe('notification.created', async (event) => {
    const payload = event.payload as unknown as NotificationPayload;
    if (!payload.userId) return;
    io.to(userRoom(payload.userId)).emit('notification:new', event.payload);
    if (typeof payload.unreadCount === 'number') {
      io.to(userRoom(payload.userId)).emit('notification:unread_count', {
        count: payload.unreadCount,
      });
    }
  });

  await consumer.subscribe([TOPICS.NOTIFICATIONS]);
  await consumer.start();
  return consumer;
}
