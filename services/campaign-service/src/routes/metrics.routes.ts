import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createMetricsService } from '../services/metrics.service.js';

const Id = z.object({ id: z.string().cuid() });
const tenantOf = (request: unknown) => (request as { user: { tenantId: string } }).user.tenantId;

export async function registerMetricsRoutes(
  app: FastifyInstance,
  metrics: ReturnType<typeof createMetricsService>
) {
  app.get('/api/v1/campaigns/:id/metrics', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.READ) }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const data = await metrics.metrics(tenantOf(request), id);
    if (!data) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    }
    return reply.send({ success: true, data });
  });
}
