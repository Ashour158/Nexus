import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { createActivityAnalyticsService } from '../services/activity.analytics.js';

const PeriodQuery = z.object({ from: z.string(), to: z.string() });

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
      r.get(
        '/analytics/activities/by-type',
        { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) },
        async (request, reply) => {
          const parsed = PeriodQuery.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          return reply.send({
            success: true,
            data: await svc.getActivityByType(jwt.tenantId, parsed.data),
          });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
