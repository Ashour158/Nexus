import type { JwtPayload } from '@nexus/shared-types';

declare module 'fastify' {
  interface FastifyInstance {
    jwt: {
      sign: (
        payload: Record<string, unknown>,
        options?: { expiresIn?: string }
      ) => string;
      verify: (token: string) => unknown;
    };
  }

  interface FastifyRequest {
    user: JwtPayload;
  }
}
