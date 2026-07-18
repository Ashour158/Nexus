import type { Socket } from 'socket.io';
import type { AuthedSocket } from '../auth.middleware.js';
import { isModule } from '../envelope.js';
import { moduleRecordRoom, moduleRoom } from '../rooms.js';
import { rateLimitDealEvent } from '../rate-limit.middleware.js';

interface SubscribePayload {
  module?: unknown;
  recordId?: unknown;
}

/**
 * Generic, tenant-scoped module/record subscription.
 *
 * A client subscribes to a whole module list (`{ module: 'deals' }`) or a
 * specific record (`{ module: 'deals', recordId: '<id>' }`) and thereafter
 * receives the uniform `<module>:event` envelope stream fanned out by the
 * consumers. The room is derived from the socket's verified JWT `tenantId`
 * (never from the client), so a client can only ever join rooms within its own
 * tenant — cross-tenant subscription is impossible.
 *
 * Complements the existing per-record handlers (`deal:subscribe`, …); it does
 * not replace them. Room membership is stored in Socket.IO's own adapter
 * registry, which drops disconnected sockets automatically.
 */
export function registerSubscriptionHandlers(socket: Socket): void {
  const tenantId = (socket as AuthedSocket).data.user.tenantId;

  socket.on('subscribe', (raw: SubscribePayload) => {
    const module = raw?.module;
    if (!isModule(module)) {
      socket.emit('subscribe_error', {
        code: 'INVALID_MODULE',
        message: 'A known module is required',
      });
      return;
    }
    if (rateLimitDealEvent(socket)) {
      socket.emit('rate_limited', {
        message: 'Rate limit exceeded: 30 room operations per minute',
      });
      return;
    }
    const recordId =
      typeof raw.recordId === 'string' && raw.recordId ? raw.recordId : undefined;
    const room = recordId
      ? moduleRecordRoom(tenantId, module, recordId)
      : moduleRoom(tenantId, module);
    socket.join(room);
    socket.emit('subscribed', { module, recordId });
  });

  socket.on('unsubscribe', (raw: SubscribePayload) => {
    const module = raw?.module;
    if (!isModule(module)) return;
    const recordId =
      typeof raw.recordId === 'string' && raw.recordId ? raw.recordId : undefined;
    const room = recordId
      ? moduleRecordRoom(tenantId, module, recordId)
      : moduleRoom(tenantId, module);
    socket.leave(room);
    socket.emit('unsubscribed', { module, recordId });
  });
}
