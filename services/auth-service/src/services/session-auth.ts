import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { NotFoundError, UnauthorizedError } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';
import { verifyKeycloakAccessToken } from '../lib/keycloak.js';
import { randomToken } from '../lib/crypto-utils.js';
import { resolveUserPermissions } from '../lib/permissions.js';

function refreshExpiry(): Date {
  const raw = process.env.REFRESH_TOKEN_EXPIRY ?? '7d';
  const days = raw.endsWith('d') ? Number.parseInt(raw.slice(0, -1), 10) : 7;
  const ms = (Number.isFinite(days) ? days : 7) * 86400_000;
  return new Date(Date.now() + ms);
}

function accessExpiresIn(): string {
  return process.env.JWT_EXPIRY ?? '15m';
}

export async function loginWithKeycloak(
  app: FastifyInstance,
  prisma: AuthPrisma,
  request: FastifyRequest,
  keycloakAccessToken: string,
  meta: { userAgent?: string; ip?: string }
): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
  const claims = await verifyKeycloakAccessToken(keycloakAccessToken);
  const keycloakId = claims.sub;
  const email =
    (typeof claims.email === 'string' && claims.email) ||
    (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
    `${keycloakId}@placeholder.local`;

  const tenantSlug =
    (typeof claims.tenant_id === 'string' && claims.tenant_id) ||
    process.env.DEFAULT_TENANT_SLUG ||
    'default';

  const tenant =
    (await prisma.tenant.findUnique({ where: { slug: tenantSlug } })) ??
    (await prisma.tenant.findFirst({ where: { isActive: true } }));

  if (!tenant) {
    throw new NotFoundError('Tenant', tenantSlug);
  }

  (request.requestContext as { set: (key: string, value: string) => void }).set('tenantId', tenant.id);

  const firstName =
    (typeof claims.given_name === 'string' && claims.given_name) || email.split('@')[0] || 'User';
  const lastName = (typeof claims.family_name === 'string' && claims.family_name) || '';

  const user = await prisma.user.upsert({
    where: { keycloakId },
    create: {
      tenantId: tenant.id,
      keycloakId,
      email,
      firstName,
      lastName,
      emailVerified: true,
    },
    update: {
      email,
      firstName,
      lastName,
      lastLoginAt: new Date(),
    },
  });

  const withRoles = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userRoles: { include: { role: true } } },
  });
  if (!withRoles) throw new NotFoundError('User', user.id);

  let roles = withRoles.userRoles.map((ur: { role: { name: string; permissions: unknown } }) => ur.role);
  if (roles.length === 0) {
    const defaultRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, name: 'SALES_REP' },
    });
    if (defaultRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: defaultRole.id },
      });
      const again = await prisma.user.findUnique({
        where: { id: user.id },
        include: { userRoles: { include: { role: true } } },
      });
      roles =
        again?.userRoles.map((ur: { role: { name: string; permissions: unknown } }) => ur.role) ?? [];
    }
  }

  const { roleNames, permissions } = resolveUserPermissions(roles);

  const refreshToken = randomToken(48);
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: refreshExpiry(),
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
    },
  });

  const payload: JwtPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    roles: roleNames,
    permissions,
  };

  const accessToken = app.jwt.sign({ ...payload } as Record<string, unknown>, {
    expiresIn: accessExpiresIn(),
  });

  return { accessToken, refreshToken, expiresIn: accessExpiresIn() };
}

export async function refreshTokens(
  app: FastifyInstance,
  prisma: AuthPrisma,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
  const session = await prisma.session.findFirst({
    where: { refreshToken, expiresAt: { gt: new Date() } },
    include: { user: { include: { userRoles: { include: { role: true } } } } },
  });
  if (!session) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const { roleNames, permissions } = resolveUserPermissions(
    session.user.userRoles.map((ur: { role: { name: string; permissions: unknown } }) => ur.role)
  );

  const newRefresh = randomToken(48);
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshToken: newRefresh, expiresAt: refreshExpiry() },
  });

  const payload: JwtPayload = {
    sub: session.user.id,
    tenantId: session.user.tenantId,
    email: session.user.email,
    roles: roleNames,
    permissions,
  };

  const accessToken = app.jwt.sign({ ...payload } as Record<string, unknown>, {
    expiresIn: accessExpiresIn(),
  });

  return { accessToken, refreshToken: newRefresh, expiresIn: accessExpiresIn() };
}

export async function revokeSession(
  prisma: AuthPrisma,
  refreshToken: string | undefined,
  userId: string
): Promise<void> {
  if (refreshToken) {
    const s = await prisma.session.findFirst({
      where: { refreshToken, userId },
    });
    if (s) {
      await prisma.session.delete({ where: { id: s.id } });
    }
    return;
  }
  await prisma.session.deleteMany({ where: { userId } });
}
