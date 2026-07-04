import type { Socket } from 'socket.io';
import { tenantRoom } from '../rooms.js';
import { listPresence } from '../presence.js';
import type { AuthedSocket } from '../auth.middleware.js';

/**
 * Presence socket handlers.
 *
 * `presence:query` lets a connected client fetch the current presence roster
 * for its own tenant on demand. Join/leave broadcasts themselves are emitted
 * from `index.ts` on connect/disconnect (where the tenant room membership is
 * managed), so they stay correctly ordered with room joins.
 *
 * Fail-open: a bad request never throws back into the socket engine.
 */
export function registerPresenceSocketHandlers(socket: Socket): void {
  socket.on('presence:query', () => {
    try {
      const authed = socket as AuthedSocket;
      const tenantId = authed.data.user?.tenantId;
      if (!tenantId) return;
      socket.emit('presence:list', {
        tenantId: tenantRoom(tenantId),
        users: listPresence(tenantId),
      });
    } catch {
      // ignore
    }
  });
}
