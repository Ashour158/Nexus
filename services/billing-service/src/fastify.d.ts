import type { JwtPayload } from '@nexus/shared-types';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
    rawBody?: Buffer;
  }
}
