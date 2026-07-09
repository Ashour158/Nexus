import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import {
  FORECAST_CATEGORIES,
  type ForecastEntryService,
} from '../services/forecast-entry.service.js';

/**
 * Rep per-deal forecast categorization (submission) + manager override.
 * Effective category = managerCategory ?? repCategory; rollup sums by effective
 * category with commit ⊆ best_case ⊆ pipeline.
 */
export async function registerForecastEntryRoutes(
  app: FastifyInstance,
  entries: ForecastEntryService
): Promise<void> {
  const CategoryEnum = z.enum(FORECAST_CATEGORIES);

  // Rep submits per-deal categories for a period (categorizes their own deals).
  app.post(
    '/api/v1/forecasts/entries',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const body = z
        .object({
          period: z.string().min(1),
          entries: z
            .array(
              z.object({
                dealId: z.string().min(1),
                amount: z.union([z.string(), z.number()]),
                category: CategoryEnum,
              })
            )
            .min(1),
        })
        .parse(request.body);
      const data = await entries.submitEntries(user.tenantId, user.sub, body.period, body.entries);
      return reply.code(201).send({ success: true, data });
    }
  );

  // Manager overrides the category for a single deal entry (audited).
  app.post(
    '/api/v1/forecasts/entries/:dealId/override',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const { dealId } = z.object({ dealId: z.string().min(1) }).parse(request.params);
      const body = z
        .object({
          period: z.string().min(1),
          // null clears the override.
          managerCategory: CategoryEnum.nullable(),
          note: z.string().optional(),
        })
        .parse(request.body);
      const data = await entries.overrideEntry(
        user.tenantId,
        body.period,
        dealId,
        user.sub,
        body.managerCategory,
        body.note
      );
      if (!data) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Deal entry not found', requestId: request.id },
        });
      }
      return reply.send({ success: true, data });
    }
  );

  // List raw entries for a period (optionally filtered by owner).
  app.get(
    '/api/v1/forecasts/entries',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const query = z
        .object({ period: z.string().min(1), ownerId: z.string().optional() })
        .parse(request.query);
      return reply.send({
        success: true,
        data: await entries.listEntries(tenantId, query.period, query.ownerId),
      });
    }
  );

  // Rollup entries by effective category, per owner + team total.
  app.get(
    '/api/v1/forecasts/entries/rollup',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const query = z
        .object({ period: z.string().min(1), ownerId: z.string().optional() })
        .parse(request.query);
      return reply.send({
        success: true,
        data: await entries.getEntryRollup(tenantId, query.period, query.ownerId),
      });
    }
  );
}
