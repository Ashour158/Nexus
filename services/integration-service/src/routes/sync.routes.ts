import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { StartSyncJobSchema } from '@nexus/validation';
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
    },
    { prefix: '/api/v1' }
  );
}