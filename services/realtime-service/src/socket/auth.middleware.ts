import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { JwtPayload } from '@nexus/shared-types';

export interface AuthedSocket extends Socket {
  data: {
    user: JwtPayload;
  };
}

export function socketAuthMiddleware(secret: string) {
  return (socket: Socket, next: (err?: Error) => void): void => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      const decoded = jwt.verify(token, secret) as JwtPayload;
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  };
}
