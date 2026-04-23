import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { createActivityAnalyticsService } from '../services/activity.analytics.js';

export async function registerActivityAnalyticsRoutes(
  app: FastifyInstance,
  clickhouse: ClickHouseClient
) {
  const svc = createActivityAnalyticsService(clickhouse);
  await app.register(
    async (r) => {
      r.get('/analytics/activities/summary', { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await svc.getActivitySummary(jwt.tenantId) });
      });
    },
    { prefix: '/api/v1' }
  );
}
