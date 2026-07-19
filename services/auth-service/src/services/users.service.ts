import type { PaginatedResult } from '@nexus/shared-types';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '@nexus/service-utils';
import type { InviteUserInput, UpdateUserInput } from '@nexus/validation';
import type { Prisma } from '../../../../node_modules/.prisma/auth-client/index.js';
import type { AuthPrisma } from '../prisma.js';
import {
  createKeycloakRealmUser,
  deleteKeycloakRealmUser,
  setKeycloakRealmUserEnabled,
  setKeycloakUserPassword,
} from '../lib/keycloak-admin.js';
import { toPaginatedResult } from '@nexus/shared-types';
import { resolveUserPermissions } from '../lib/permissions.js';
import { hashPassword } from '@nexus/security';
import { randomBytes } from 'node:crypto';

/**
 * User row with role assignments (Section 31.1 relations), with the secret
 * `passwordHash` column omitted. Every read that reaches an API response uses
 * `SAFE_USER_ARGS` so the hash never leaves the data layer.
 */
export type UserWithRoles = Prisma.UserGetPayload<{
  omit: { passwordHash: true };
  include: { userRoles: { include: { role: true } } };
}>;

/** Shared Prisma args: strip the password hash, include role assignments. */
const SAFE_USER_ARGS = {
  omit: { passwordHash: true },
  include: { userRoles: { include: { role: true } } },
} as const;

/**
 * Whether invites provision a LOCAL account (temp password + forced change) rather
 * than a Keycloak realm user. True when Keycloak isn't configured, or explicitly
 * forced via AUTH_LOCAL_INVITE. Local mode returns the temp password to the caller
 * (the admin conveys it / it is emailed) — Keycloak mode never exposes a password.
 */
function localInviteMode(): boolean {
  return !process.env.KEYCLOAK_URL || process.env.AUTH_LOCAL_INVITE === 'true';
}

/** Generate a policy-compliant temporary password (>=12, upper/lower/digit/symbol). */
function generateTempPassword(): string {
  return `Nx!${randomBytes(6).toString('base64url')}9aZ`;
}

/** Filters for `listUsers` (query string subset). */
export type UserListFilters = {
  search?: string;
  /** When omitted, defaults to `true` (active users only). */
  isActive?: boolean;
  roleId?: string;
};

/** Pagination + sort for `listUsers`. */
export type UserListPagination = {
  page: number;
  limit: number;
  sortDir: 'asc' | 'desc';
};

/**
 * Builds the Prisma `where` clause for tenant-scoped user lists.
 */
function buildUserListWhere(
  tenantId: string,
  filters: UserListFilters
): Prisma.UserWhereInput {
  const isActive = filters.isActive ?? true;
  const where: Prisma.UserWhereInput = {
    tenantId,
    isActive,
  };
  if (filters.search?.trim()) {
    where.email = { contains: filters.search.trim(), mode: 'insensitive' };
  }
  if (filters.roleId) {
    where.userRoles = { some: { roleId: filters.roleId } };
  }
  return where;
}

/**
 * User management service (Section 34.1) — all business logic for `/api/v1/users`.
 */
export function createUsersService(prisma: AuthPrisma) {
  async function getUserById(tenantId: string, id: string): Promise<UserWithRoles> {
    const row = await prisma.user.findFirst({
      where: { id, tenantId },
      ...SAFE_USER_ARGS,
    });
    if (!row) {
      throw new NotFoundError('User', id);
    }
    return row;
  }

  return {
    /**
     * Lists users for a tenant with optional filters and pagination.
     */
    async listUsers(
      tenantId: string,
      filters: UserListFilters,
      pagination: UserListPagination
    ): Promise<PaginatedResult<UserWithRoles>> {
      const where = buildUserListWhere(tenantId, filters);
      const { page, limit, sortDir } = pagination;
      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: sortDir },
          ...SAFE_USER_ARGS,
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    getUserById,

    /**
     * Creates the user in Keycloak (Admin API) and persists to PostgreSQL with roles.
     */
    async inviteUser(
      tenantId: string,
      data: InviteUserInput
    ): Promise<UserWithRoles & { temporaryPassword?: string }> {
      const existing = await prisma.user.findFirst({
        where: { tenantId, email: data.email },
      });
      if (existing) {
        throw new ConflictError('User', 'email');
      }

      const uniqueRoleIds = [...new Set(data.roleIds)];
      const roleRows = await prisma.role.findMany({
        where: { id: { in: uniqueRoleIds }, tenantId },
      });
      if (roleRows.length !== uniqueRoleIds.length) {
        throw new NotFoundError('Role', 'invalid');
      }

      // LOCAL invite path: no Keycloak. Create the account with a temporary
      // password and mustChangePassword=true so first login forces a reset.
      if (localInviteMode()) {
        const temporaryPassword = generateTempPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        const user = await prisma.$transaction((tx) =>
          tx.user.create({
            data: {
              tenantId,
              email: data.email,
              firstName: data.firstName,
              lastName: data.lastName,
              keycloakId: `local:${tenantId}:${data.email}`,
              passwordHash,
              mustChangePassword: true,
              emailVerified: true,
              isActive: true,
              bookingToken: randomBytes(16).toString('hex'),
              userRoles: {
                create: uniqueRoleIds.map((roleId) => ({ role: { connect: { id: roleId } } })),
              },
            },
            ...SAFE_USER_ARGS,
          })
        );
        return { ...user, temporaryPassword };
      }

      const keycloakId = await createKeycloakRealmUser({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.email,
      });
      try {
        return await prisma.$transaction(async (tx) => {
          return tx.user.create({
            data: {
              tenantId,
              email: data.email,
              firstName: data.firstName,
              lastName: data.lastName,
              keycloakId,
              bookingToken: randomBytes(16).toString('hex'),
              userRoles: {
                create: uniqueRoleIds.map((roleId) => ({
                  role: { connect: { id: roleId } },
                })),
              },
            },
            ...SAFE_USER_ARGS,
          });
        });
      } catch (err) {
        try {
          await deleteKeycloakRealmUser(keycloakId);
        } catch {
          /* best-effort rollback */
        }
        throw err;
      }
    },

    /**
     * Updates profile fields for a user in the tenant.
     */
    async updateUser(
      tenantId: string,
      id: string,
      data: UpdateUserInput
    ): Promise<UserWithRoles> {
      await getUserById(tenantId, id);
      const updated = await prisma.user.update({
        where: { id_tenantId: { id, tenantId } },
        data,
        ...SAFE_USER_ARGS,
      });
      return updated;
    },

    /**
     * Admin-triggered password reset. Generates a policy-compliant temporary
     * password, forces a change on next login, and invalidates existing
     * sessions so the old password stops working immediately. The temp password
     * is returned to the admin to convey to the user (both local and Keycloak
     * modes) — matching the invite flow's contract.
     */
    async adminResetPassword(
      tenantId: string,
      id: string,
      actorUserId: string
    ): Promise<{ temporaryPassword: string }> {
      if (id === actorUserId) {
        throw new BusinessRuleError('Use "Change password" to reset your own password');
      }
      const row = await prisma.user.findFirst({ where: { id, tenantId } });
      if (!row) {
        throw new NotFoundError('User', id);
      }
      const temporaryPassword = generateTempPassword();

      if (localInviteMode() || row.keycloakId.startsWith('local:')) {
        const passwordHash = await hashPassword(temporaryPassword);
        await prisma.$transaction([
          prisma.user.update({
            where: { id_tenantId: { id, tenantId } },
            data: { passwordHash, mustChangePassword: true },
          }),
          prisma.session.deleteMany({ where: { userId: id } }),
        ]);
        return { temporaryPassword };
      }

      // Keycloak-managed account: set a temporary password (forces change on
      // next login) via the Admin API, then drop local sessions.
      await setKeycloakUserPassword(row.keycloakId, temporaryPassword, true);
      await prisma.session.deleteMany({ where: { userId: id } });
      return { temporaryPassword };
    },

    /**
     * Soft-deactivates the user, clears sessions, and disables the account in Keycloak.
     */
    async deactivateUser(
      tenantId: string,
      id: string,
      actorUserId: string
    ): Promise<void> {
      if (id === actorUserId) {
        throw new BusinessRuleError('Cannot deactivate yourself');
      }
      const row = await prisma.user.findFirst({
        where: { id, tenantId },
      });
      if (!row) {
        throw new NotFoundError('User', id);
      }
      if (!row.keycloakId.startsWith('pending:')) {
        await setKeycloakRealmUserEnabled(row.keycloakId, false);
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id_tenantId: { id, tenantId } },
          data: { isActive: false },
        }),
        prisma.session.deleteMany({ where: { userId: id } }),
      ]);
    },

    /**
     * Replaces role assignments for a user (all role ids must belong to the tenant).
     */
    async assignRoles(tenantId: string, userId: string, roleIds: string[]): Promise<void> {
      await getUserById(tenantId, userId);
      const uniqueRoleIds = [...new Set(roleIds)];
      const roleRows = await prisma.role.findMany({
        where: { id: { in: uniqueRoleIds }, tenantId },
      });
      if (roleRows.length !== uniqueRoleIds.length) {
        throw new NotFoundError('Role', 'invalid');
      }
      const existingRoles = await prisma.userRole.findMany({
        where: { userId, user: { tenantId } },
        select: { id: true },
      });
      await prisma.$transaction([
        prisma.userRole.deleteMany({ where: { id: { in: existingRoles.map((r) => r.id) } } }),
        prisma.userRole.createMany({
          data: uniqueRoleIds.map((roleId) => ({ userId, roleId })),
        }),
      ]);
    },

    /**
     * Returns merged permission strings for the user’s roles.
     */
    async getUserPermissions(tenantId: string, userId: string): Promise<string[]> {
      const row = await prisma.user.findFirst({
        where: { id: userId, tenantId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!row) {
        throw new NotFoundError('User', userId);
      }
      const { permissions } = resolveUserPermissions(
        row.userRoles.map((ur) => ur.role as { name: string; permissions: unknown })
      );
      return permissions;
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
