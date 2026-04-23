import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { ValidationError } from '@nexus/service-utils';
import {
  ForgotPasswordSchema,
  KeycloakLoginSchema,
  RefreshTokenBodySchema,
  ResetPasswordSchema,
} from '@nexus/validation';
import type { AuthPrisma } from '../prisma.js';
import { loginWithKeycloak, refreshTokens, revokeSession } from '../services/session-auth.js';

/**
 * Registers `/api/v1/auth/*` routes (Section 34.1).
 */
export async function registerAuthRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/auth/login', async (request, reply) => {
        const parsed = KeycloakLoginSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const tokens = await loginWithKeycloak(app, prisma, request, parsed.data.keycloakAccessToken, {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });
        return reply.send({ success: true, data: tokens });
      });

      r.post('/auth/refresh', async (request, reply) => {
        const parsed = RefreshTokenBodySchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const tokens = await refreshTokens(app, prisma, parsed.data.refreshToken);
        return reply.send({ success: true, data: tokens });
      });

      r.post('/auth/logout', async (request, reply) => {
        const body = (request.body ?? {}) as { refreshToken?: string };
        const user = request.user as JwtPayload | undefined;
        if (user?.sub) {
          await revokeSession(prisma, body.refreshToken, user.sub);
        }
        return reply.send({ success: true, data: { loggedOut: true } });
      });

      r.post('/auth/forgot-password', async (request, reply) => {
        const parsed = ForgotPasswordSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        return reply.send({
          success: true,
          data: { message: 'If an account exists, password reset instructions were sent.' },
        });
      });

      r.post('/auth/reset-password', async (request, reply) => {
        const parsed = ResetPasswordSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        return reply.send({
          success: true,
          data: { message: 'Password reset is not yet configured for this environment.' },
        });
      });
    },
    { prefix: '/api/v1' }
  );
}
