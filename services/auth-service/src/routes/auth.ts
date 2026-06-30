import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { ValidationError } from '@nexus/service-utils';
import {
  ForgotPasswordSchema,
  KeycloakLoginSchema,
  RefreshTokenBodySchema,
  ResetPasswordSchema,
} from '@nexus/validation';
import { hashPassword, validatePasswordStrength } from '@nexus/security';
import type { AuthPrisma } from '../prisma.js';
import { loginWithKeycloak, refreshTokens, revokeSession } from '../services/session-auth.js';
import type { JwksKeyStore } from '../lib/jwt.js';
import type { NexusProducer } from '@nexus/kafka';
import { setKeycloakUserPassword } from '../lib/keycloak-admin.js';

/**
 * Registers `/api/v1/auth/*` routes (Section 34.1).
 */
export async function registerAuthRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma,
  keyStore: JwksKeyStore,
  producer: NexusProducer
): Promise<void> {
  void producer;
  await app.register(
    async (r) => {
      r.post('/auth/login', async (request, reply) => {
        const parsed = KeycloakLoginSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const result = await loginWithKeycloak(keyStore, prisma, request, parsed.data.keycloakAccessToken, {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });
        if (result.mfaRequired) {
          return reply.send({ success: true, data: { mfaRequired: true, mfaToken: result.mfaToken } });
        }
        try {
          const parts = result.accessToken.split('.');
          if (parts.length === 3) {
            const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8')) as { sub?: string; tenantId?: string };
            if (claims.sub && claims.tenantId) {
              void prisma.auditLog.create({
                data: {
                  tenantId: claims.tenantId,
                  userId: claims.sub,
                  action: 'auth.login',
                  resource: 'session',
                  ipAddress: request.ip,
                  userAgent: request.headers['user-agent'] ?? null,
                },
              });
            }
          }
        } catch { /* non-blocking */ }
        return reply.send({ success: true, data: result });
      });

      r.post('/auth/refresh', async (request, reply) => {
        const parsed = RefreshTokenBodySchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const tokens = await refreshTokens(keyStore, prisma, parsed.data.refreshToken);
        return reply.send({ success: true, data: tokens });
      });

      r.post('/auth/logout', async (request, reply) => {
        const body = (request.body ?? {}) as { refreshToken?: string };
        const user = request.user as JwtPayload | undefined;
        if (user?.sub) {
          await revokeSession(prisma, body.refreshToken, user.sub);
          if (user.tenantId) {
            void prisma.auditLog.create({
              data: {
                tenantId: user.tenantId,
                userId: user.sub,
                action: 'auth.logout',
                resource: 'session',
                ipAddress: request.ip,
              },
            });
          }
        }
        return reply.send({ success: true, data: { loggedOut: true } });
      });

      r.post('/auth/forgot-password', async (request, reply) => {
        const parsed = ForgotPasswordSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const { email } = parsed.data;
        const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
        if (user) {
          const resetToken = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
          await prisma.passwordReset.create({
            data: { userId: user.id, token: resetToken, expiresAt },
          });

          const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
          const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

          // Attempt to queue email via comm-service internal endpoint
          const commUrl = process.env.COMM_SERVICE_URL ?? 'http://localhost:3009';
          const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? '';
          let emailQueued = false;

          try {
            const resp = await fetch(`${commUrl}/api/v1/internal/outbox/email-broadcast`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-service-token': internalToken,
              },
              body: JSON.stringify({
                tenantId: user.tenantId,
                recipients: [user.email],
                subject: 'Password reset requested',
                htmlBody: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
              }),
            });
            if (resp.ok) {
              emailQueued = true;
              request.log.info({ userId: user.id }, 'Password reset email queued via comm-service');
            }
          } catch (err) {
            request.log.warn({ err, userId: user.id }, 'comm-service unreachable for password reset email');
          }

          // Fallback: write to local outbox so a relay can pick it up later
          if (!emailQueued) {
            try {
              await prisma.outboxMessage.create({
                data: {
                  topic: 'comm.email.send',
                  payload: {
                    to: user.email,
                    subject: 'Password reset requested',
                    htmlBody: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
                    tenantId: user.tenantId,
                  },
                  aggregateId: user.id,
                  status: 'PENDING',
                },
              });
              request.log.info({ userId: user.id }, 'Password reset email written to local outbox');
            } catch (outboxErr) {
              request.log.error({ outboxErr, userId: user.id }, 'Failed to write password reset to outbox');
            }
          }

          request.log.info({ userId: user.id }, 'Password reset email queued');
        }
        // Always return same message to prevent user enumeration
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
        const { token, newPassword } = parsed.data as { token: string; newPassword: string };

        const strength = validatePasswordStrength(newPassword);
        if (!strength.valid) {
          throw new ValidationError('Password too weak', { fieldErrors: { newPassword: strength.errors } });
        }

        const resetRecord = await prisma.passwordReset.findFirst({
          where: { token, usedAt: null, expiresAt: { gt: new Date() } },
        });
        if (!resetRecord) {
          throw new ValidationError('Invalid or expired reset token');
        }

        const targetUser = await prisma.user.findFirst({
          where: { id: resetRecord.userId },
          select: { id: true, tenantId: true },
        });
        if (!targetUser) {
          throw new ValidationError('Invalid or expired reset token');
        }

        const passwordHash = await hashPassword(newPassword);
        const user = await prisma.user.update({
          where: { id_tenantId: { id: targetUser.id, tenantId: targetUser.tenantId } },
          data: { passwordHash },
        });
        await prisma.passwordReset.update({
          where: { id: resetRecord.id },
          data: { usedAt: new Date() },
        });
        // Invalidate all existing sessions for the user
        await prisma.session.deleteMany({ where: { userId: user.id } });
        // Sync password to Keycloak
        if (user.keycloakId) {
          try {
            await setKeycloakUserPassword(user.keycloakId, newPassword);
          } catch (kcErr) {
            request.log.warn({ err: kcErr, userId: user.id }, 'Keycloak password sync failed');
          }
        }
        // Audit log
        await prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'PASSWORD_RESET',
            resource: 'user',
            resourceId: user.id,
            newValue: { resetAt: new Date().toISOString() },
          },
        });

        return reply.send({
          success: true,
          data: { message: 'Password reset successfully. Please log in with your new password.' },
        });
      });
    },
    { prefix: '/api/v1' }
  );
}
