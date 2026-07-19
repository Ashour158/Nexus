import type { FastifyRequest } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { NotFoundError, ROLE_PERMISSIONS, runCrossTenant, UnauthorizedError, ValidationError } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';
import { verifyKeycloakAccessToken } from '../lib/keycloak.js';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@nexus/security';
import { randomToken } from '../lib/crypto-utils.js';
import { resolveUserPermissions } from '../lib/permissions.js';
import type { JwksKeyStore } from '../lib/jwt.js';
import { isMfaEnabled } from './mfa.service.js';

function refreshExpiry(): Date {
  const raw = process.env.REFRESH_TOKEN_EXPIRY ?? '7d';
  const days = raw.endsWith('d') ? Number.parseInt(raw.slice(0, -1), 10) : 7;
  const ms = (Number.isFinite(days) ? days : 7) * 86400_000;
  return new Date(Date.now() + ms);
}

function accessExpiresIn(): string {
  return process.env.JWT_EXPIRY ?? '15m';
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  mfaRequired: false;
  /** True when the account was invited and hasn't reset its temp password yet. */
  mustChangePassword?: boolean;
}

export interface MfaChallengeResult {
  mfaRequired: true;
  mfaToken: string;
}

export type AuthResult = LoginResult | MfaChallengeResult;

export async function loginWithKeycloak(
  keyStore: JwksKeyStore,
  prisma: AuthPrisma,
  request: FastifyRequest,
  keycloakAccessToken: string,
  meta: { userAgent?: string; ip?: string }
): Promise<AuthResult> {
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

  ((request as any).requestContext as { set: (key: string, value: string) => void }).set('tenantId', tenant.id);

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

  // Check MFA
  return finalizeSession(keyStore, prisma, user, meta);
}

/**
 * Email/password login against the local user store (passwordHash). This is the
 * interim credential flow the web login form uses; Keycloak SSO layers on top via
 * loginWithKeycloak. Returns the same session shape so both paths are interchangeable.
 */
export async function loginWithPassword(
  keyStore: JwksKeyStore,
  prisma: AuthPrisma,
  request: FastifyRequest,
  email: string,
  password: string,
  meta: { userAgent?: string; ip?: string },
  /**
   * Optional workspace (tenant) slug. The same email can exist in more than one
   * workspace (`@@unique([tenantId, email])`); when the caller knows which
   * workspace to sign into it passes the slug and we scope the lookup to it.
   * Without a slug we fall back to the first active match (single-workspace
   * users, and legacy callers, are unaffected).
   */
  tenantSlug?: string
): Promise<AuthResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const where: { email: string; isActive: boolean; tenantId?: string } = {
    email: normalizedEmail,
    isActive: true,
  };
  if (tenantSlug?.trim()) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug.toLowerCase().trim() },
      select: { id: true },
    });
    // Unknown workspace → uniform invalid-credentials error (no enumeration).
    if (!tenant) {
      await verifyPassword(password, '$2b$10$0000000000000000000000000000000000000000000000000000').catch(() => false);
      throw new UnauthorizedError('Invalid email or password');
    }
    where.tenantId = tenant.id;
  }
  const user = await prisma.user.findFirst({ where });
  // Uniform error + a verify against a dummy hash to reduce timing/user-enumeration signal.
  if (!user || !user.passwordHash) {
    await verifyPassword(password, '$2b$10$0000000000000000000000000000000000000000000000000000').catch(() => false);
    throw new UnauthorizedError('Invalid email or password');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedError('Invalid email or password');
  }

  ((request as any).requestContext as { set: (key: string, value: string) => void }).set('tenantId', user.tenantId);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return finalizeSession(keyStore, prisma, user, meta);
}

/** A workspace an email belongs to — the shape the login picker consumes. */
export interface WorkspaceRef {
  tenantId: string;
  slug: string;
  name: string;
}

/**
 * Lists the workspaces (tenants) an email has an active account in. Powers the
 * multi-workspace login picker: the web form calls this first; if more than one
 * workspace comes back it asks the user to choose before submitting the password.
 * Returns an empty list for unknown emails (the caller must not leak that
 * difference to the user).
 */
export async function listWorkspacesForEmail(
  prisma: AuthPrisma,
  email: string
): Promise<WorkspaceRef[]> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return [];
  const users = await prisma.user.findMany({
    where: { email: normalizedEmail, isActive: true },
    select: { tenant: { select: { id: true, slug: true, name: true } } },
  });
  return users
    .map((u) => u.tenant)
    .filter((t): t is { id: string; slug: string; name: string } => Boolean(t))
    .map((t) => ({ tenantId: t.id, slug: t.slug, name: t.name }));
}

/** Derive a URL-safe workspace slug from a company name. */
function slugifyWorkspace(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace';
}

export interface RegisterWorkspaceInput {
  companyName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Self-service workspace signup: atomically provisions a new tenant, seeds the
 * built-in roles (from ROLE_PERMISSIONS), and creates the first user as its
 * SUPER_ADMIN — then issues a session so the caller is signed straight in.
 * The email only needs to be unique WITHIN the new tenant (`@@unique([tenantId,
 * email])`), so the same address can own or join multiple workspaces.
 */
export async function registerWorkspace(
  keyStore: JwksKeyStore,
  prisma: AuthPrisma,
  request: FastifyRequest,
  input: RegisterWorkspaceInput,
  meta: { userAgent?: string; ip?: string }
): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();
  const companyName = input.companyName.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!companyName || !firstName || !lastName || !email) {
    throw new ValidationError('Company name, your name, and email are all required');
  }
  const strength = validatePasswordStrength(input.password);
  if (!strength.valid) {
    throw new ValidationError(strength.errors?.[0] ?? 'Password does not meet the security policy');
  }

  // Resolve a unique workspace slug (append a short suffix on collision).
  const base = slugifyWorkspace(companyName);
  let slug = base;
  for (let i = 0; i < 5; i += 1) {
    const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${base}-${randomToken(3).toLowerCase()}`;
  }

  const passwordHash = await hashPassword(input.password);

  // Bootstrap the tenant + its roles + admin under an explicit cross-tenant
  // context. Every write below carries the new tenantId directly, but this is a
  // PUBLIC route with no tenant in AsyncLocalStorage, so the tenant-scoped Prisma
  // extension would otherwise fail-closed on Role.createMany / user.create.
  const user = await runCrossTenant('self-service workspace registration', () =>
    prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { slug, name: companyName },
    });
    // Seed the full built-in role catalogue so the roles admin isn't empty.
    await tx.role.createMany({
      data: Object.entries(ROLE_PERMISSIONS).map(([name, permissions]) => ({
        tenantId: tenant.id,
        name,
        description: `${name} (built-in)`,
        permissions,
        isSystem: true,
      })),
    });
    const superAdmin = await tx.role.findFirst({
      where: { tenantId: tenant.id, name: 'SUPER_ADMIN' },
      select: { id: true },
    });
    const created = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        firstName,
        lastName,
        keycloakId: `local:${tenant.id}:${email}`,
        passwordHash,
        emailVerified: true,
        isActive: true,
        bookingToken: randomToken(16),
        ...(superAdmin ? { userRoles: { create: { roleId: superAdmin.id } } } : {}),
      },
    });
    return created;
    })
  );

  (request as unknown as { requestContext: { set: (k: string, v: string) => void } }).requestContext.set(
    'tenantId',
    user.tenantId
  );
  // finalizeSession runs with the request tenant context set above, so its
  // tenant-scoped reads/writes resolve correctly without cross-tenant mode.
  return finalizeSession(keyStore, prisma, user, meta);
}

/**
 * Shared session issuance: MFA gate → resolve roles (default SALES_REP) → persist
 * refresh session → mint access token. Used by both Keycloak and password login.
 */
async function finalizeSession(
  keyStore: JwksKeyStore,
  prisma: AuthPrisma,
  user: { id: string; tenantId: string; email: string; mustChangePassword?: boolean },
  meta: { userAgent?: string; ip?: string }
): Promise<AuthResult> {
  const mfaRequired = await isMfaEnabled(prisma, user.id);
  if (mfaRequired) {
    const mfaToken = await keyStore.sign(
      { sub: user.id, type: 'mfa_challenge', tenantId: user.tenantId },
      { expiresIn: '5m' }
    );
    return { mfaRequired: true, mfaToken };
  }

  const withRoles = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userRoles: { include: { role: true } } },
  });
  if (!withRoles) throw new NotFoundError('User', user.id);

  let roles = withRoles.userRoles.map((ur: { role: { name: string; permissions: unknown } }) => ur.role);
  if (roles.length === 0) {
    const defaultRole = await prisma.role.findFirst({
      where: { tenantId: user.tenantId, name: 'SALES_REP' },
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
      mfaVerified: false,
    },
  });

  const payload: JwtPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    roles: roleNames,
    permissions,
  };

  const accessToken = await keyStore.sign({ ...payload } as Record<string, unknown>, {
    expiresIn: accessExpiresIn(),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: accessExpiresIn(),
    mfaRequired: false,
    ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
  };
}

export async function refreshTokens(
  keyStore: JwksKeyStore,
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

  const accessToken = await keyStore.sign({ ...payload } as Record<string, unknown>, {
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
