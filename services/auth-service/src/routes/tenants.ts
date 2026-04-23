import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { NotFoundError, PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { PatchTenantSchema } from '@nexus/validation';
import type { AuthPrisma } from '../prisma.js';

/**
 * Registers `/api/v1/tenants/me` routes (Section 34.1).
 */
export async function registerTenantsRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/tenants/me',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const tenant = await prisma.tenant.findUnique({ where: { id: jwt.tenantId } });
          if (!tenant) throw new NotFoundError('Tenant', jwt.tenantId);
          return reply.send({ success: true, data: tenant });
        }
      );

      r.patch(
        '/tenants/me',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = PatchTenantSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const data = {
            ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
            ...(parsed.data.settings !== undefined ? { settings: parsed.data.settings } : {}),
          };
          const tenant = await prisma.tenant.update({
            where: { id: jwt.tenantId },
            data,
          });
          await prisma.auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'UPDATE',
              resource: 'Tenant',
              resourceId: jwt.tenantId,
              newValue: data as object,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: tenant });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
