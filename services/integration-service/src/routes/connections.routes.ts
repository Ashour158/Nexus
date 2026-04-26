import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { UpsertConnectionSchema } from '@nexus/validation';
import type { createConnectionsService } from '../services/connections.service.js';

export async function registerConnectionsRoutes(
  app: FastifyInstance,
  connections: ReturnType<typeof createConnectionsService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/integrations/connections',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (_request, reply) => {
          const rows = await connections.listConnections();
          return reply.send({ success: true, data: rows });
        }
      );

      r.put(
        '/integrations/connections',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const parsed = UpsertConnectionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await connections.upsertConnection(parsed.data);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
