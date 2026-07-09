import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { userRoom } from '../socket/rooms.js';

interface NotificationPayload {
  userId?: string;
  unreadCount?: number;
}

export async function startNotificationConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.notifications');

  // Call consumer.on directly (bound), like every other consumer in this service.
  // A previous version extracted it into a local (`const onUnsafe = consumer.on`)
  // and invoked it unbound, so `this` was undefined inside on() and it threw
  // "Cannot read properties of undefined (reading 'handlers')". Because this
  // consumer starts first, that throw bailed the whole consumer-startup block to
  // WebSocket-only mode — silently disabling every realtime Kafka consumer.
  consumer.on('notification.created', async (event) => {
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
