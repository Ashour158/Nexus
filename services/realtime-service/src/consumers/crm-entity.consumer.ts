import type { Server } from 'socket.io';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { accountRoom, contactRoom, tenantRoom, userRoom } from '../socket/rooms.js';
import { buildEnvelope, emitEnvelope, type DomainEvent } from '../socket/envelope.js';

/**
 * Fans out contact and account domain events (from the CRM service) to
 * connected WebSocket clients.
 *
 * Routing (all carrying the consistent envelope):
 *  - module stream → `contacts:event` / `accounts:event` for generic
 *                    `subscribe({ module })` clients (tenant- and record-scoped)
 *  - tenant room   → every tenant dashboard gets the update
 *  - entity room   → clients that `contact:subscribe` / `account:subscribe`d to
 *                    the specific record get a targeted event
 *  - owner room    → the assigned owner (when the payload carries `ownerId`)
 *
 * Fail-open: emits are isolated so a bad payload or dead socket can't crash the
 * consumer loop. Events without a `tenantId` are dropped by `buildEnvelope`.
 */
export async function startCrmEntityConsumer(io: Server): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('realtime-service.crm-entities');

  const fanOutContact = (eventName: string) =>
    async (event: DomainEvent) => {
      try {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const contactId = typeof payload.contactId === 'string' ? payload.contactId : '';
        const envelope = buildEnvelope('contacts', event, contactId || undefined);
        if (!envelope) return;
        emitEnvelope(io, envelope);
        io.to(tenantRoom(envelope.tenantId)).emit(eventName, envelope);
        if (contactId) io.to(contactRoom(contactId)).emit(eventName, envelope);
        const ownerId = typeof payload.ownerId === 'string' ? payload.ownerId : '';
        if (ownerId) io.to(userRoom(ownerId)).emit(eventName, envelope);
      } catch {
        // Never let a fan-out failure crash the consumer.
      }
    };

  const fanOutAccount = (eventName: string) =>
    async (event: DomainEvent) => {
      try {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const accountId = typeof payload.accountId === 'string' ? payload.accountId : '';
        const envelope = buildEnvelope('accounts', event, accountId || undefined);
        if (!envelope) return;
        emitEnvelope(io, envelope);
        io.to(tenantRoom(envelope.tenantId)).emit(eventName, envelope);
        if (accountId) io.to(accountRoom(accountId)).emit(eventName, envelope);
        const ownerId = typeof payload.ownerId === 'string' ? payload.ownerId : '';
        if (ownerId) io.to(userRoom(ownerId)).emit(eventName, envelope);
      } catch {
        // Never let a fan-out failure crash the consumer.
      }
    };

  consumer.on('contact.created', fanOutContact('contact:created'));
  consumer.on('contact.updated', fanOutContact('contact:updated'));
  consumer.on('contact.archived', fanOutContact('contact:archived'));
  consumer.on('contact.restored', fanOutContact('contact:restored'));

  consumer.on('account.created', fanOutAccount('account:created'));
  consumer.on('account.updated', fanOutAccount('account:updated'));
  consumer.on('account.archived', fanOutAccount('account:archived'));
  consumer.on('account.restored', fanOutAccount('account:restored'));

  await consumer.subscribe([TOPICS.CONTACTS, TOPICS.ACCOUNTS]);
  await consumer.start();
  return consumer;
}
