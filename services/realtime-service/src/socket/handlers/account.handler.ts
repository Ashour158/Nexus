import type { Socket } from 'socket.io';
import { accountRoom } from '../rooms.js';

export function registerAccountSocketHandlers(socket: Socket): void {
  socket.on('account:subscribe', (accountId: string) => {
    if (!accountId || typeof accountId !== 'string') {
      socket.emit('account:subscribe_error', { code: 'INVALID_INPUT', message: 'accountId is required' });
      return;
    }
    socket.join(accountRoom(accountId));
    socket.emit('account:subscribed', { accountId });
  });

  socket.on('account:unsubscribe', (accountId: string) => {
    if (!accountId || typeof accountId !== 'string') return;
    socket.leave(accountRoom(accountId));
  });
}
