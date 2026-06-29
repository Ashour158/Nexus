import type { FastifyInstance } from 'fastify';
import { ValidationError, UnauthorizedError } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';
import type { JwksKeyStore } from '../lib/jwt.js';
import {
  setupMfa,
  verifyAndEnableMfa,
  verifyMfaCode,
  disableMfa,
  isMfaEnabled,
  regenerateBackupCodes,
} from '../services/mfa.service.js';

export async function registerMfaRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma,
  keyStore: JwksKeyStore
): Promise<void> {
  await app.register(
    async (r) => {
      // POST /api/v1/auth/mfa/setup — Initiate MFA setup (returns QR code)
      r.post('/auth/mfa/setup', async (request, reply) => {
        const user = request.user as { sub: string; email: string } | undefined;
        if (!user?.sub) throw new UnauthorizedError('Authentication required');

        const result = await setupMfa(prisma, user.sub, user.email);
        return reply.send({ success: true, data: result });
      });

      // POST /api/v1/auth/mfa/enable — Verify first TOTP code and enable MFA
      r.post('/auth/mfa/enable', async (request, reply) => {
        const user = request.user as { sub: string } | undefined;
        if (!user?.sub) throw new UnauthorizedError('Authentication required');

        const { code } = request.body as { code?: string };
        if (!code || typeof code !== 'string') {
          throw new ValidationError('TOTP code is required');
        }

        await verifyAndEnableMfa(prisma, user.sub, code);
        return reply.send({ success: true, data: { enabled: true } });
      });

      // POST /api/v1/auth/mfa/verify — Verify TOTP during login (uses mfaToken)
      r.post('/auth/mfa/verify', async (request, reply) => {
        const { mfaToken, code } = request.body as { mfaToken?: string; code?: string };
        if (!mfaToken || !code) {
          throw new ValidationError('mfaToken and code are required');
        }

        let payload: { sub: string; type: string };
        try {
          payload = (await keyStore.verify(mfaToken)) as unknown as { sub: string; type: string };
        } catch {
          throw new UnauthorizedError('Invalid or expired MFA token');
        }

        if (payload.type !== 'mfa_challenge') {
          throw new UnauthorizedError('Invalid MFA token type');
        }

        const isValid = await verifyMfaCode(prisma, payload.sub, code);
        if (!isValid) {
          throw new UnauthorizedError('Invalid TOTP code or backup code');
        }

        // Issue full session tokens
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          include: { userRoles: { include: { role: true } } },
        });
        if (!user) throw new UnauthorizedError('User not found');

        const { resolveUserPermissions } = await import('../lib/permissions.js');
        const { roleNames, permissions } = resolveUserPermissions(
          user.userRoles.map((ur) => ur.role)
        );

        const { randomToken } = await import('../lib/crypto-utils.js');
        const refreshToken = randomToken(48);
        const rawExpiry = process.env.REFRESH_TOKEN_EXPIRY ?? '7d';
        const days = rawExpiry.endsWith('d') ? Number.parseInt(rawExpiry.slice(0, -1), 10) : 7;
        const expiresAt = new Date(Date.now() + (Number.isFinite(days) ? days : 7) * 86400_000);

        await prisma.session.create({
          data: {
            userId: user.id,
            refreshToken,
            expiresAt,
            userAgent: request.headers['user-agent'],
            ipAddress: request.ip,
            mfaVerified: true,
          },
        });

        const jwtPayload = {
          sub: user.id,
          tenantId: user.tenantId,
          email: user.email,
          roles: roleNames,
          permissions,
        };

        const accessToken = await keyStore.sign({ ...jwtPayload } as Record<string, unknown>, {
          expiresIn: process.env.JWT_EXPIRY ?? '15m',
        });

        return reply.send({
          success: true,
          data: { accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRY ?? '15m' },
        });
      });

      // POST /api/v1/auth/mfa/disable — Disable MFA
      r.post('/auth/mfa/disable', async (request, reply) => {
        const user = request.user as { sub: string } | undefined;
        if (!user?.sub) throw new UnauthorizedError('Authentication required');

        const { code } = request.body as { code?: string };
        if (!code) throw new ValidationError('TOTP code is required');

        await disableMfa(prisma, user.sub, code);
        return reply.send({ success: true, data: { disabled: true } });
      });

      // GET /api/v1/auth/mfa/status — Check MFA status
      r.get('/auth/mfa/status', async (request, reply) => {
        const user = request.user as { sub: string } | undefined;
        if (!user?.sub) throw new UnauthorizedError('Authentication required');

        const enabled = await isMfaEnabled(prisma, user.sub);
        return reply.send({ success: true, data: { enabled } });
      });

      // POST /api/v1/auth/mfa/backup-codes — Regenerate backup codes
      r.post('/auth/mfa/backup-codes', async (request, reply) => {
        const user = request.user as { sub: string } | undefined;
        if (!user?.sub) throw new UnauthorizedError('Authentication required');

        const { code } = request.body as { code?: string };
        if (!code) throw new ValidationError('TOTP code is required');

        const backupCodes = await regenerateBackupCodes(prisma, user.sub, code);
        return reply.send({ success: true, data: { backupCodes } });
      });
    },
    { prefix: '/api/v1' }
  );
}
