import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { ValidationError } from '@nexus/service-utils';
import {
  ForgotPasswordSchema,
  KeycloakLoginSchema,
  RefreshTokenBodySchema,
  ResetPasswordSchema,
} from '@nexus/validation';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@nexus/security';
import type { AuthPrisma } from '../prisma.js';
import { listWorkspacesForEmail, loginWithKeycloak, loginWithPassword, refreshTokens, registerWorkspace, revokeSession } from '../services/session-auth.js';
import { z } from 'zod';
import type { JwksKeyStore } from '../lib/jwt.js';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { UnifiedAuditLogger } from '../lib/unified-audit.js';
import { setKeycloakUserPassword } from '../lib/keycloak-admin.js';
import { clearLoginFailures, getLoginLock, recordLoginFailure } from '../lib/login-throttle.js';

const PasswordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Optional workspace slug for multi-workspace accounts (login picker). */
  workspaceSlug: z.string().min(1).max(60).optional(),
});

const RegisterSchema = z.object({
  companyName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

/**
 * Registers `/api/v1/auth/*` routes (Section 34.1).
 */
export async function registerAuthRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma,
  keyStore: JwksKeyStore,
  producer: NexusProducer,
  unifiedAudit: UnifiedAuditLogger
): Promise<void> {
  void producer;
  await app.register(
    async (r) => {
      r.post('/auth/login', async (request, reply) => {
        // Polymorphic login: email+password (local credential flow used by the web
        // form) OR keycloakAccessToken (SSO). Password path is tried first when the
        // body carries credentials.
        const pw = PasswordLoginSchema.safeParse(request.body);
        if (pw.success) {
          // Brute-force lockout: reject before touching the credential store once
          // an email has too many recent consecutive failures.
          const lock = await getLoginLock(pw.data.email);
          if (lock.locked) {
            reply.header('Retry-After', String(lock.retryAfterSec));
            return reply.code(429).send({
              success: false,
              error: {
                code: 'ACCOUNT_LOCKED',
                message: `Too many failed login attempts. Try again in ${Math.ceil(lock.retryAfterSec / 60)} minute(s).`,
                requestId: request.id,
              },
            });
          }
          let result;
          try {
            result = await loginWithPassword(
              keyStore, prisma, request, pw.data.email, pw.data.password,
              { userAgent: request.headers['user-agent'], ip: request.ip },
              pw.data.workspaceSlug
            );
          } catch (err) {
            await recordLoginFailure(pw.data.email);
            throw err;
          }
          await clearLoginFailures(pw.data.email);
          if ('mfaRequired' in result && result.mfaRequired) {
            return reply.send({ success: true, data: { mfaRequired: true, mfaToken: result.mfaToken } });
          }
          return reply.send({ success: true, data: result });
        }
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
              void unifiedAudit.log({
                tenantId: claims.tenantId,
                actorId: claims.sub,
                action: 'auth.login',
                resource: 'session',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
              });
            }
          }
        } catch { /* non-blocking */ }
        return reply.send({ success: true, data: result });
      });

      /**
       * Self-service workspace signup (public). Creates a new tenant + its
       * built-in roles + the first SUPER_ADMIN user, then signs the caller in.
       */
      r.post('/auth/register', async (request, reply) => {
        const parsed = RegisterSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const result = await registerWorkspace(keyStore, prisma, request, parsed.data, {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });
        return reply.code(201).send({ success: true, data: result });
      });

      /**
       * Public workspace lookup by email — the login form calls this to decide
       * whether to show a workspace picker. Always 200 with a (possibly empty)
       * list; never reveals whether a specific email exists in a way that aids
       * enumeration beyond what login already does.
       */
      r.get('/auth/workspaces', async (request, reply) => {
        const email = (request.query as { email?: string }).email ?? '';
        const parsedEmail = z.string().email().safeParse(email);
        if (!parsedEmail.success) {
          return reply.send({ success: true, data: { workspaces: [] } });
        }
        const workspaces = await listWorkspacesForEmail(prisma, parsedEmail.data);
        return reply.send({ success: true, data: { workspaces } });
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

          // Fallback: write to the local outbox so the relay delivers it later.
          // The topic and eventType must match what comm-service actually
          // consumes (TOPICS.EMAIL_SEND / email.send.requested) — the previous
          // 'comm.email.send' literal had no consumer, so a reset requested
          // while comm-service was briefly down was silently lost.
          if (!emailQueued) {
            try {
              await prisma.outboxMessage.create({
                data: {
                  topic: TOPICS.EMAIL_SEND,
                  payload: {
                    to: user.email,
                    subject: 'Password reset requested',
                    htmlBody: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
                    tenantId: user.tenantId,
                  },
                  aggregateId: user.id,
                  eventType: 'email.send.requested',
                  headers: { eventType: 'email.send.requested', tenantId: user.tenantId },
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

      /**
       * Authenticated self-service password change. This is the second half of the
       * invite flow: an invited user logs in with their temp password (login returns
       * `mustChangePassword: true`), then calls this with the current + new password.
       * Not in `isPublicRoute`, so the global JWT preHandler has already verified the
       * bearer token and populated `request.user`.
       */
      r.post('/auth/change-password', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = z
          .object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) })
          .safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const { currentPassword, newPassword } = parsed.data;

        const user = await prisma.user.findFirst({
          where: { id: jwt.sub, tenantId: jwt.tenantId },
        });
        if (!user || !user.passwordHash) {
          throw new ValidationError('Password change unavailable for this account', {});
        }
        const ok = await verifyPassword(currentPassword, user.passwordHash);
        if (!ok) {
          return reply.code(401).send({
            success: false,
            error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect', requestId: request.id },
          });
        }
        if (currentPassword === newPassword) {
          throw new ValidationError('New password must differ from the current password', {});
        }
        const strength = validatePasswordStrength(newPassword);
        if (!strength.valid) {
          throw new ValidationError('Password too weak', { fieldErrors: { newPassword: strength.errors } });
        }

        const passwordHash = await hashPassword(newPassword);
        await prisma.user.update({
          where: { id_tenantId: { id: user.id, tenantId: user.tenantId } },
          data: { passwordHash, mustChangePassword: false },
        });
        await prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'PASSWORD_CHANGE',
            resource: 'user',
            resourceId: user.id,
            newValue: { changedAt: new Date().toISOString() },
          },
        });
        return reply.send({ success: true, data: { message: 'Password changed. Please use your new password from now on.' } });
      });
    },
    { prefix: '/api/v1' }
  );
}
