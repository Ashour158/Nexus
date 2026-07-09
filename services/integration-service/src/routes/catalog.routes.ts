import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createCatalogService } from '../services/catalog.service.js';

export async function registerCatalogRoutes(
  app: FastifyInstance,
  catalog: ReturnType<typeof createCatalogService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/integrations/catalog',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (_request, reply) => {
          const data = await catalog.listCatalog();
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
