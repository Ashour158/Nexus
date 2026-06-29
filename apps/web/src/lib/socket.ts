'use client';

import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(): Socket {
  const token = useAuthStore.getState().accessToken;

  // Recreate socket if token changed or socket doesn't exist
  if (!socket || token !== currentToken) {
    if (socket) {
      socket.disconnect();
    }
    currentToken = token;
    socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:3005', {
      auth: { token: token ?? undefined },
      transports: ['websocket'],
      autoConnect: false,
    });
  }

  return socket;
}

export function connectSocket(): void {
  getSocket().connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}
