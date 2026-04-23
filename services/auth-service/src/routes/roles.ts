import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  BusinessRuleError,
  NotFoundError,
  PERMISSIONS,
  requirePermission,
  ROLE_PERMISSIONS,
  ValidationError,
} from '@nexus/service-utils';
import { CreateRoleSchema, IdParamSchema, PaginationSchema, UpdateRoleSchema } from '@nexus/validation';
import type { AuthPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

function allStaticPermissions(): string[] {
  const out = new Set<string>();
  for (const v of Object.values(PERMISSIONS)) {
    if (typeof v === 'object' && v !== null) {
      for (const p of Object.values(v)) {
        if (typeof p === 'string') out.add(p);
      }
    }
  }
  return [...out].sort();
}

/**
 * Registers `/api/v1/roles/*` routes (Section 34.1).
 */
export async function registerRolesRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/roles/permissions/matrix',
        { preHandler: requirePermission('roles:read') },
        async (_request, reply) => {
          return reply.send({
            success: true,
            data: {
              permissions: allStaticPermissions(),
              builtInRolePermissions: ROLE_PERMISSIONS,
            },
          });
        }
      );

      r.get('/roles', { preHandler: requirePermission('roles:read') }, async (request, reply) => {
        const q = PaginationSchema.parse(request.query);
        const jwt = request.user as JwtPayload;
        const where = { tenantId: jwt.tenantId };
        const [total, rows] = await Promise.all([
          prisma.role.count({ where }),
          prisma.role.findMany({
            where,
            skip: (q.page - 1) * q.limit,
            take: q.limit,
            orderBy: { name: 'asc' },
          }),
        ]);
        return reply.send({
          success: true,
          data: toPaginatedResult(rows, total, q.page, q.limit),
        });
      });

      r.post('/roles', { preHandler: requirePermission('roles:create') }, async (request, reply) => {
        const parsed = CreateRoleSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const jwt = request.user as JwtPayload;
        const role = await prisma.role.create({
          data: {
            tenantId: jwt.tenantId,
            name: parsed.data.name,
            description: parsed.data.description,
            permissions: parsed.data.permissions,
          },
        });
        await prisma.auditLog.create({
          data: {
            tenantId: jwt.tenantId,
            userId: jwt.sub,
            action: 'CREATE',
            resource: 'Role',
            resourceId: role.id,
            newValue: parsed.data as object,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });
        return reply.code(201).send({ success: true, data: role });
      });

      r.get('/roles/:id', { preHandler: requirePermission('roles:read') }, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const row = await prisma.role.findUnique({ where: { id } });
        if (!row) throw new NotFoundError('Role', id);
        return reply.send({ success: true, data: row });
      });

      r.patch('/roles/:id', { preHandler: requirePermission('roles:update') }, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = UpdateRoleSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid body', parsed.error.flatten());
        }
        const existing = await prisma.role.findUnique({ where: { id } });
        if (!existing) throw new NotFoundError('Role', id);
        if (existing.isSystem) {
          throw new BusinessRuleError('Cannot modify system role');
        }
        const jwt = request.user as JwtPayload;
        const role = await prisma.role.update({
          where: { id },
          data: parsed.data,
        });
        await prisma.auditLog.create({
          data: {
            tenantId: jwt.tenantId,
            userId: jwt.sub,
            action: 'UPDATE',
            resource: 'Role',
            resourceId: id,
            newValue: parsed.data as object,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });
        return reply.send({ success: true, data: role });
      });

      r.delete('/roles/:id', { preHandler: requirePermission('roles:delete') }, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const existing = await prisma.role.findUnique({ where: { id } });
        if (!existing) throw new NotFoundError('Role', id);
        if (existing.isSystem) {
          throw new BusinessRuleError('Cannot delete system role');
        }
        const jwt = request.user as JwtPayload;
        await prisma.role.delete({ where: { id } });
        await prisma.auditLog.create({
          data: {
            tenantId: jwt.tenantId,
            userId: jwt.sub,
            action: 'DELETE',
            resource: 'Role',
            resourceId: id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });
        return reply.send({ success: true, data: { id } });
      });
    },
    { prefix: '/api/v1' }
  );
}
