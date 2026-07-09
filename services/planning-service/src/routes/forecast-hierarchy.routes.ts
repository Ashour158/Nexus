import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ForecastHierarchyService } from '../services/forecast-hierarchy.service.js';

/**
 * Manager/org-hierarchy forecast roll-up: rep → manager → VP tree with per-node
 * own + rolled-up forecast and quota attainment. The caller's bearer token is
 * forwarded so the org chart (auth-service) and rep-summary (crm-service) are
 * resolved under the caller's authorization.
 */
export async function registerForecastHierarchyRoutes(
  app: FastifyInstance,
  hierarchy: ForecastHierarchyService
): Promise<void> {
  app.get(
    '/api/v1/forecasts/hierarchy',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const query = z.object({ period: z.string().min(1) }).parse(request.query);
      const bearer = request.headers.authorization;
      return reply.send({
        success: true,
        data: await hierarchy.getHierarchyRollup(tenantId, query.period, bearer),
      });
    }
  );
}
