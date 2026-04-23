import type { Socket } from 'socket.io';
import { userRoom } from '../rooms.js';
import type { AuthedSocket } from '../auth.middleware.js';

export function registerNotificationSocketHandlers(socket: Socket): void {
  const authed = socket as AuthedSocket;
  const userId = authed.data.user?.sub;
  if (userId) {
    socket.join(userRoom(userId));
  }

  socket.on('notification:subscribe', () => {
    if (!userId) return;
    socket.join(userRoom(userId));
  });

  socket.on('notification:unsubscribe', () => {
    if (!userId) return;
    socket.leave(userRoom(userId));
  });
}
