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
  // Only attempt a live connection when a realtime URL is actually configured.
  // Without it the client would dial ws://localhost:3005 from the browser (the
  // user's own machine) and fail noisily/repeatedly. Live updates are disabled
  // until NEXT_PUBLIC_REALTIME_URL points at a browser-reachable endpoint.
  if (!process.env.NEXT_PUBLIC_REALTIME_URL) {
    return;
  }
  getSocket().connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}
