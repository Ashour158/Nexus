import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { createForecastAnalyticsService } from '../services/forecast.analytics.js';

export async function registerForecastAnalyticsRoutes(
  app: FastifyInstance,
  clickhouse: ClickHouseClient
) {
  const svc = createForecastAnalyticsService(clickhouse);
  await app.register(
    async (r) => {
      r.get('/analytics/forecast/weighted-pipeline', { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await svc.getWeightedPipeline(jwt.tenantId) });
      });
    },
    { prefix: '/api/v1' }
  );
}
