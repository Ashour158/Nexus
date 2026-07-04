import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { tenantRoom, userRoom } from '../socket/rooms.js';

/**
 * Fans out lead domain events (from the CRM service) to connected WebSocket
 * clients. Every lead event is pushed to the tenant room so any dashboard for
 * that tenant gets live updates (new lead, lead updated, lead converted). When
 * the payload carries an `ownerId`, the event is also pushed to that user's
 * room so the assigned rep is notified directly.
 *
 * Fail-open: individual emits are wrapped so a malformed payload or a dead
 * socket can never crash the consumer loop.
 */
export async function startLeadConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.leads');

  const fanOut = (eventName: string) =>
    async (event: { type: string; tenantId: string; payload: unknown }) => {
      try {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        io.to(tenantRoom(event.tenantId)).emit(eventName, {
          type: event.type,
          payload,
        });
        const ownerId = typeof payload.ownerId === 'string' ? payload.ownerId : '';
        if (ownerId) {
          io.to(userRoom(ownerId)).emit(eventName, {
            type: event.type,
            payload,
          });
        }
      } catch {
        // Never let a fan-out failure crash the consumer.
      }
    };

  consumer.on('lead.created', fanOut('lead:created'));
  consumer.on('lead.updated', fanOut('lead:updated'));
  consumer.on('lead.assigned', fanOut('lead:updated'));
  consumer.on('lead.qualified', fanOut('lead:updated'));
  consumer.on('lead.converted', fanOut('lead:converted'));
  consumer.on('lead.deleted', fanOut('lead:deleted'));

  await consumer.subscribe([TOPICS.LEADS]);
  await consumer.start();
  return consumer;
}
