import type { Socket } from 'socket.io';
import { contactRoom } from '../rooms.js';

export function registerContactSocketHandlers(socket: Socket): void {
  socket.on('contact:subscribe', (contactId: string) => {
    if (!contactId || typeof contactId !== 'string') {
      socket.emit('contact:subscribe_error', { code: 'INVALID_INPUT', message: 'contactId is required' });
      return;
    }
    socket.join(contactRoom(contactId));
    socket.emit('contact:subscribed', { contactId });
  });

  socket.on('contact:unsubscribe', (contactId: string) => {
    if (!contactId || typeof contactId !== 'string') return;
    socket.leave(contactRoom(contactId));
  });
}
