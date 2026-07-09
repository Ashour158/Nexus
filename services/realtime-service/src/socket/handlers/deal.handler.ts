import type { Socket } from 'socket.io';
import { dealRoom } from '../rooms.js';
import { authorizeDealRoom } from '../authorize.js';
import { rateLimitDealEvent } from '../rate-limit.middleware.js';

export function registerDealSocketHandlers(socket: Socket): void {
  socket.on('deal:subscribe', async (dealId: string) => {
    if (!dealId) {
      socket.emit('deal:subscribe_error', { code: 'INVALID_INPUT', message: 'dealId is required' });
      return;
    }

    if (rateLimitDealEvent(socket)) {
      socket.emit('deal:rate_limited', { message: 'Rate limit exceeded: 30 room operations per minute' });
      return;
    }

    const auth = await authorizeDealRoom(socket, dealId);
    if (!auth.allowed) {
      socket.emit('deal:subscribe_error', { code: auth.reason ?? 'FORBIDDEN', message: 'Not authorized to subscribe to this deal' });
      return;
    }
    socket.join(dealRoom(dealId));
    socket.emit('deal:subscribed', { dealId });
  });

  socket.on('deal:unsubscribe', (dealId: string) => {
    if (!dealId) return;

    if (rateLimitDealEvent(socket)) {
      socket.emit('deal:rate_limited', { message: 'Rate limit exceeded: 30 room operations per minute' });
      return;
    }

    socket.leave(dealRoom(dealId));
  });
}
