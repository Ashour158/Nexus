import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ForecastRollupService } from '../services/forecast-rollup.service.js';

/**
 * Read endpoints over the event-driven forecast aggregate maintained by the
 * deals consumer. Additive: these live alongside the manual-submission
 * `/api/v1/forecasts/rollup` and never replace it.
 */
export async function registerForecastRollupRoutes(
  app: FastifyInstance,
  rollup: ForecastRollupService
): Promise<void> {
  // Live per-owner/team forecast for a period, derived from deal events.
  app.get(
    '/api/v1/forecasts/live-rollup',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const query = z.object({ period: z.string().min(1) }).parse(request.query);
      return reply.send({ success: true, data: await rollup.getRollup(tenantId, query.period) });
    }
  );

  // Quota attainment (closed-won vs quota) for one owner+period.
  app.get(
    '/api/v1/forecasts/attainment',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const query = z
        .object({ ownerId: z.string().min(1), period: z.string().min(1) })
        .parse(request.query);
      return reply.send({
        success: true,
        data: await rollup.getAttainment(tenantId, query.ownerId, query.period),
      });
    }
  );

  // Forecast TREND: point-in-time snapshot series for a period, so the UI can
  // chart how commit / best-case / AI-weighted moved across the quarter.
  app.get(
    '/api/v1/forecasts/trend',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const query = z
        .object({
          period: z.string().min(1),
          scope: z.enum(['owner', 'team']).default('team'),
          ownerId: z.string().optional(),
        })
        .refine((q) => q.scope !== 'owner' || Boolean(q.ownerId && q.ownerId.length > 0), {
          message: 'ownerId is required when scope is "owner"',
          path: ['ownerId'],
        })
        .parse(request.query);
      return reply.send({
        success: true,
        data: await rollup.getTrend(tenantId, query.period, query.scope, query.ownerId),
      });
    }
  );
}
