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
} from '../lib/keycloak-admin.js';
import { toPaginatedResult } from '../lib/pagination.js';
import { resolveUserPermissions } from '../lib/permissions.js';

/** User row with role assignments (Section 31.1 relations). */
export type UserWithRoles = Prisma.UserGetPayload<{
  include: { userRoles: { include: { role: true } } };
}>;

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
      include: { userRoles: { include: { role: true } } },
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
          include: { userRoles: { include: { role: true } } },
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    getUserById,

    /**
     * Creates the user in Keycloak (Admin API) and persists to PostgreSQL with roles.
     */
    async inviteUser(tenantId: string, data: InviteUserInput): Promise<UserWithRoles> {
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
              userRoles: {
                create: uniqueRoleIds.map((roleId) => ({
                  role: { connect: { id: roleId } },
                })),
              },
            },
            include: { userRoles: { include: { role: true } } },
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
        where: { id },
        data,
        include: { userRoles: { include: { role: true } } },
      });
      return updated;
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
          where: { id },
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
      await prisma.$transaction([
        prisma.userRole.deleteMany({ where: { userId } }),
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
