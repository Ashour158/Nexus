import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { createRevenueAnalyticsService } from '../services/revenue.analytics.js';

const RevenueQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

export async function registerRevenueAnalyticsRoutes(
  app: FastifyInstance,
  clickhouse: ClickHouseClient
) {
  const svc = createRevenueAnalyticsService(clickhouse);
  await app.register(
    async (r) => {
      r.get('/analytics/revenue/summary', { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) }, async (request, reply) => {
        const parsed = RevenueQuery.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await svc.getRevenueSummary(jwt.tenantId, parsed.data) });
      });
      r.get('/analytics/revenue/by-rep', { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) }, async (request, reply) => {
        const parsed = RevenueQuery.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await svc.getRevenueByRep(jwt.tenantId, parsed.data) });
      });
    },
    { prefix: '/api/v1' }
  );
}
