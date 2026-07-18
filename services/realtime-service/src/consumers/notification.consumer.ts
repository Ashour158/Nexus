import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { userRoom } from '../socket/rooms.js';
import { buildEnvelope, emitEnvelope } from '../socket/envelope.js';

interface NotificationPayload {
  userId?: string;
  notificationId?: string;
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
    // Canonical envelope stream for generic `subscribe({ module: 'notifications' })`
    // clients. Dropped when the event carries no tenantId.
    emitEnvelope(io, buildEnvelope('notifications', event, payload.notificationId));
    if (!payload.userId) return;
    // Legacy per-user channels the web client listens on — shapes preserved
    // exactly (raw payload; `{ count }`) so existing handlers keep working.
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
