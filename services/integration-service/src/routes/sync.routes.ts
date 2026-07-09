import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { IdParamSchema, StartSyncJobSchema } from '@nexus/validation';
import type { createSyncService } from '../services/sync.service.js';

export async function registerSyncRoutes(
  app: FastifyInstance,
  sync: ReturnType<typeof createSyncService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/integrations/sync/jobs',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (_request, reply) => {
          const rows = await sync.listJobs();
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/integrations/sync/jobs',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const parsed = StartSyncJobSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = (request as unknown as { user: JwtPayload }).user;
          const row = await sync.startJob(jwt.tenantId, parsed.data);
          return reply.code(202).send({ success: true, data: row });
        }
      );

      r.get(
        '/integrations/sync/connections/:id/state',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const state = await sync.getConnectorSyncState(params.data.id);
          if (!state) {
            return reply
              .code(404)
              .send({ success: false, error: { code: 'NOT_FOUND', message: 'Connection not found' } });
          }
          return reply.send({ success: true, data: state });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}