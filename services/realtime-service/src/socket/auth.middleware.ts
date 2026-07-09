import { jwtVerify, createRemoteJWKSet } from 'jose';
import { z } from 'zod';
import type { Socket } from 'socket.io';
import type { JwtPayload } from '@nexus/shared-types';

export interface AuthedSocket extends Socket {
  data: {
    user: JwtPayload;
    token: string;
  };
}

const JWKS_URL = process.env.AUTH_JWKS_URL ?? 'http://auth-service:3010/.well-known/jwks.json';
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

const JwtPayloadSchema = z.object({
  sub: z.string().min(1),
  tenantId: z.string().min(1),
  roles: z.array(z.string()),
});

export function socketAuthMiddleware() {
  return (socket: Socket, next: (err?: Error) => void): void => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      jwtVerify(token, jwks, { clockTolerance: 60 })
        .then(({ payload }) => {
          const parsed = JwtPayloadSchema.safeParse(payload);
          if (!parsed.success) {
            next(new Error('Unauthorized'));
            return;
          }
          socket.data.user = parsed.data as unknown as JwtPayload;
          socket.data.token = token;
          next();
        })
        .catch(() => {
          next(new Error('Unauthorized'));
        });
    } catch {
      next(new Error('Unauthorized'));
    }
  };
}
