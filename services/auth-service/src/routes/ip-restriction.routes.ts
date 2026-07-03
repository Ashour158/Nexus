import type { FastifyInstance } from 'fastify';
import { ValidationError, UnauthorizedError, requirePermission, PERMISSIONS } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';

export async function registerIpRestrictionRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // GET /api/v1/auth/ip-restrictions
      r.get('/auth/ip-restrictions', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const user = request.user as { sub: string; tenantId: string } | undefined;
        if (!user?.tenantId) throw new UnauthorizedError('Authentication required');

        const items = await prisma.ipRestriction.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: items });
      });

      // POST /api/v1/auth/ip-restrictions
      r.post('/auth/ip-restrictions', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const user = request.user as { sub: string; tenantId: string } | undefined;
        if (!user?.tenantId) throw new UnauthorizedError('Authentication required');

        const body = request.body as { type?: string; cidr?: string; description?: string };
        if (!body.type || !['ALLOW', 'BLOCK'].includes(body.type)) {
          throw new ValidationError('type must be ALLOW or BLOCK');
        }
        if (!body.cidr || typeof body.cidr !== 'string') {
          throw new ValidationError('cidr is required');
        }

        const item = await prisma.ipRestriction.create({
          data: {
            tenantId: user.tenantId,
            type: body.type,
            cidr: body.cidr,
            description: body.description,
          },
        });
        return reply.status(201).send({ success: true, data: item });
      });

      // PATCH /api/v1/auth/ip-restrictions/:id
      r.patch('/auth/ip-restrictions/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const user = request.user as { sub: string; tenantId: string } | undefined;
        if (!user?.tenantId) throw new UnauthorizedError('Authentication required');

        const { id } = request.params as { id: string };
        const body = request.body as { cidr?: string; description?: string; enabled?: boolean };

        const item = await prisma.ipRestriction.updateMany({
          where: { id, tenantId: user.tenantId },
          data: body,
        });
        if (item.count === 0) throw new ValidationError('IP restriction not found');
        return reply.send({ success: true, data: { updated: true } });
      });

      // DELETE /api/v1/auth/ip-restrictions/:id
      r.delete('/auth/ip-restrictions/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const user = request.user as { sub: string; tenantId: string } | undefined;
        if (!user?.tenantId) throw new UnauthorizedError('Authentication required');

        const { id } = request.params as { id: string };
        await prisma.ipRestriction.deleteMany({ where: { id, tenantId: user.tenantId } });
        return reply.send({ success: true, data: { deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
