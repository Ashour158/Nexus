import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { IdParamSchema } from '@nexus/validation';
import type { AuthPrisma } from '../prisma.js';
import { createUsersService } from '../services/users.service.js';
import { NexusCache } from '@nexus/cache';

/**
 * Registers `/api/v1/permissions/*` routes with Redis caching.
 */
export async function registerPermissionsRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  const users = createUsersService(prisma);
  const cache = new NexusCache();

  await app.register(
    async (r) => {
      r.get(
        '/users/:id/permissions',
        { preHandler: requirePermission(PERMISSIONS.USERS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const cacheKey = `permissions:${jwt.tenantId}:${id}`;

          const permissions = await cache.cacheAside(
            cacheKey,
            () => users.getUserPermissions(jwt.tenantId, id),
            300_000
          );

          return reply.send({ success: true, data: permissions });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
