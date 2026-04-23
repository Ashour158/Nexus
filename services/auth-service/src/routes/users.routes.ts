import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  AssignRolesSchema,
  IdParamSchema,
  InviteUserSchema,
  UpdateUserSchema,
  UserListQuerySchema,
} from '@nexus/validation';
import type { AuthPrisma } from '../prisma.js';
import { createUsersService } from '../services/users.service.js';

/**
 * Registers `/api/v1/users/*` (Section 34.1) using the users service layer.
 */
export async function registerUsersRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  const users = createUsersService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/users',
        { preHandler: requirePermission(PERMISSIONS.USERS.READ) },
        async (request, reply) => {
          const q = UserListQuerySchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const { page, limit, sortDir, search, isActive, roleId } = q;
          const result = await users.listUsers(
            jwt.tenantId,
            { search, isActive, roleId },
            { page, limit, sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/users/invite',
        { preHandler: requirePermission(PERMISSIONS.USERS.INVITE) },
        async (request, reply) => {
          const parsed = InviteUserSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const created = await users.inviteUser(jwt.tenantId, parsed.data);
          await prisma.auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'CREATE',
              resource: 'User',
              resourceId: created.id,
              newValue: { email: created.email },
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return reply.code(201).send({ success: true, data: created });
        }
      );

      r.get(
        '/users/:id/permissions',
        { preHandler: requirePermission(PERMISSIONS.USERS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const permissions = await users.getUserPermissions(jwt.tenantId, id);
          return reply.send({ success: true, data: permissions });
        }
      );

      r.patch(
        '/users/:id/roles',
        { preHandler: requirePermission(PERMISSIONS.USERS.MANAGE_ROLES) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = AssignRolesSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          await users.assignRoles(jwt.tenantId, id, parsed.data.roleIds);
          const row = await users.getUserById(jwt.tenantId, id);
          await prisma.auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'UPDATE',
              resource: 'UserRoles',
              resourceId: id,
              newValue: { roleIds: parsed.data.roleIds },
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.get(
        '/users/:id',
        { preHandler: requirePermission(PERMISSIONS.USERS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await users.getUserById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/users/:id',
        { preHandler: requirePermission(PERMISSIONS.USERS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateUserSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const updated = await users.updateUser(jwt.tenantId, id, parsed.data);
          await prisma.auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'UPDATE',
              resource: 'User',
              resourceId: id,
              newValue: parsed.data as object,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/users/:id',
        { preHandler: requirePermission(PERMISSIONS.USERS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await users.deactivateUser(jwt.tenantId, id, jwt.sub);
          await prisma.auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'DELETE',
              resource: 'User',
              resourceId: id,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: { id, deactivated: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
