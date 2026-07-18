import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { tenantRoom, userRoom } from '../socket/rooms.js';
import { buildEnvelope, emitEnvelope, type DomainEvent } from '../socket/envelope.js';

/**
 * Fans out lead domain events (from the CRM service) to connected WebSocket
 * clients. Every lead event is delivered as the consistent envelope on the
 * canonical `leads:event` module stream and on the legacy `lead:*` channels:
 *  - tenant room → any dashboard for that tenant gets live updates
 *  - owner room  → when the payload carries an `ownerId`, the assigned rep is
 *                  notified directly
 *
 * Fail-open: individual emits are wrapped so a malformed payload or a dead
 * socket can never crash the consumer loop. Events without a `tenantId` are
 * dropped by `buildEnvelope`.
 */
export async function startLeadConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.leads');

  const fanOut = (eventName: string) =>
    async (event: DomainEvent) => {
      try {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const leadId = typeof payload.leadId === 'string' ? payload.leadId : '';
        const envelope = buildEnvelope('leads', event, leadId || undefined);
        if (!envelope) return;
        emitEnvelope(io, envelope);
        io.to(tenantRoom(envelope.tenantId)).emit(eventName, envelope);
        const ownerId = typeof payload.ownerId === 'string' ? payload.ownerId : '';
        if (ownerId) {
          io.to(userRoom(ownerId)).emit(eventName, envelope);
        }
      } catch {
        // Never let a fan-out failure crash the consumer.
      }
    };

  consumer.on('lead.created', fanOut('lead:created'));
  consumer.on('lead.updated', fanOut('lead:updated'));
  consumer.on('lead.assigned', fanOut('lead:updated'));
  consumer.on('lead.qualified', fanOut('lead:updated'));
  // crm-service now emits `lead.unqualified` alongside `lead.qualified` for a
  // disqualification transition; fan it out the same way so the UI reflects the
  // status change either direction.
  consumer.on('lead.unqualified', fanOut('lead:updated'));
  consumer.on('lead.converted', fanOut('lead:converted'));
  // crm-service switched leads to soft-delete: it emits `lead.archived` /
  // `lead.restored` (never `lead.deleted`). Handle the live events so archive
  // and restore propagate to connected clients.
  consumer.on('lead.archived', fanOut('lead:archived'));
  consumer.on('lead.restored', fanOut('lead:restored'));
  // Retained for backward compatibility; no live service emits `lead.deleted`.
  consumer.on('lead.deleted', fanOut('lead:deleted'));

  await consumer.subscribe([TOPICS.LEADS]);
  await consumer.start();
  return consumer;
}
