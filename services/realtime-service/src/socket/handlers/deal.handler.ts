import type { Socket } from 'socket.io';
import { dealRoom } from '../rooms.js';

export function registerDealSocketHandlers(socket: Socket): void {
  socket.on('deal:subscribe', (dealId: string) => {
    if (!dealId) return;
    socket.join(dealRoom(dealId));
  });

  socket.on('deal:unsubscribe', (dealId: string) => {
    if (!dealId) return;
    socket.leave(dealRoom(dealId));
  });
}
