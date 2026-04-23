import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { createPipelineAnalyticsService } from '../services/pipeline.analytics.js';
import type { ClickHouseClient } from '@clickhouse/client';

const PeriodQuery = z.object({ from: z.string(), to: z.string() });

export async function registerPipelineAnalyticsRoutes(
  app: FastifyInstance,
  clickhouse: ClickHouseClient
) {
  const svc = createPipelineAnalyticsService(clickhouse);
  await app.register(
    async (r) => {
      r.get('/analytics/pipeline/summary', { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const pipelineId = (request.query as { pipelineId?: string }).pipelineId;
        return reply.send({ success: true, data: await svc.getPipelineSummary(jwt.tenantId, pipelineId) });
      });
      r.get('/analytics/pipeline/funnel', { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) }, async (request, reply) => {
        const parsed = PeriodQuery.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await svc.getFunnelConversion(jwt.tenantId, parsed.data) });
      });
      r.get('/analytics/pipeline/velocity', { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) }, async (request, reply) => {
        const parsed = PeriodQuery.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await svc.getDealVelocity(jwt.tenantId, parsed.data) });
      });
    },
    { prefix: '/api/v1' }
  );
}
