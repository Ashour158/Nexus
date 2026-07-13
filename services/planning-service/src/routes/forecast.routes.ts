import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ForecastRollupService } from '../services/forecast-rollup.service.js';
import type { CategoryMapService } from '../services/category-map.service.js';
import { FORECAST_CATEGORY_KINDS } from '../services/category-map.service.js';
import { resolveSubtreeOwnerIds } from '../lib/org-subtree.js';

/**
 * Consolidated forecasting surface:
 *   - GET  /api/v1/forecast              — category breakdown + weighted pipeline
 *                                          + quota/attainment + manager roll-up
 *   - POST /api/v1/forecast/snapshot     — capture a point-in-time snapshot now
 *   - CRUD /api/v1/forecast/category-map — per-tenant deal-stage → category config
 *
 * Additive: lives alongside the older `/api/v1/forecasts/*` roll-up routes.
 */

const CategoryKind = z.enum(FORECAST_CATEGORY_KINDS);

export async function registerForecastRoutes(
  app: FastifyInstance,
  rollup: ForecastRollupService,
  categoryMap: CategoryMapService
): Promise<void> {
  // Consolidated forecast for a period (owner or whole team) + manager roll-up.
  app.get(
    '/api/v1/forecast',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const q = z
        .object({ period: z.string().min(1), ownerId: z.string().optional() })
        .parse(request.query);
      // When scoped to an owner, resolve their reporting subtree (self +
      // subordinates) so a manager number rolls up over the team. Fail-open.
      const subtree = q.ownerId
        ? await resolveSubtreeOwnerIds(tenantId, q.ownerId, request.headers.authorization)
        : undefined;
      return reply.send({
        success: true,
        data: await rollup.getForecast(tenantId, q.period, q.ownerId, subtree),
      });
    }
  );

  // Manually capture a point-in-time forecast snapshot for the caller's tenant.
  app.post(
    '/api/v1/forecast/snapshot',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const body = z
        .object({ asOf: z.string().datetime().optional() })
        .parse(request.body ?? {});
      const asOf = body.asOf ? new Date(body.asOf) : new Date();
      const res = await rollup.snapshotAll(asOf);
      return reply.send({ success: true, data: { asOf, ...res } });
    }
  );

  // ─── ForecastCategoryMap (deal stage → forecast category) ──────────────────
  app.get(
    '/api/v1/forecast/category-map',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      return reply.send({ success: true, data: await categoryMap.list(tenantId) });
    }
  );

  app.put(
    '/api/v1/forecast/category-map',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const body = z
        .object({
          mappings: z.array(z.object({ stage: z.string().min(1), category: CategoryKind })).min(1),
        })
        .parse(request.body);
      return reply.send({ success: true, data: await categoryMap.bulkSet(tenantId, body.mappings) });
    }
  );

  app.post(
    '/api/v1/forecast/category-map',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const body = z.object({ stage: z.string().min(1), category: CategoryKind }).parse(request.body);
      return reply
        .code(201)
        .send({ success: true, data: await categoryMap.upsertOne(tenantId, body.stage, body.category) });
    }
  );

  app.delete(
    '/api/v1/forecast/category-map/:stage',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const { stage } = z.object({ stage: z.string().min(1) }).parse(request.params);
      const ok = await categoryMap.remove(tenantId, stage);
      if (!ok)
        return reply
          .code(404)
          .send({ success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found', requestId: request.id } });
      return reply.send({ success: true, data: { stage, deleted: true } });
    }
  );
}
