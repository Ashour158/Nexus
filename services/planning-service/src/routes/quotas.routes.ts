import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createQuotasService } from '../services/quotas.service.js';

const PlanBody = z.object({
  name: z.string().min(1),
  year: z.number().int().min(2000),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  type: z.enum(['REVENUE', 'DEAL_COUNT', 'ACTIVITY_COUNT', 'NEW_LOGOS']).optional(),
  currency: z.string().default('USD'),
  isActive: z.boolean().optional(),
  targets: z
    .array(
      z.object({
        ownerId: z.string().min(1),
        targetValue: z.union([z.string(), z.number()]),
        currency: z.string().optional(),
      })
    )
    .optional(),
});
const IdParam = z.object({ id: z.string().cuid() });

export async function registerQuotasRoutes(
  app: FastifyInstance,
  quotas: ReturnType<typeof createQuotasService>
): Promise<void> {
  app.get('/api/v1/quotas/plans', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ year: z.coerce.number().int().optional() }).parse(request.query);
    return reply.send({ success: true, data: await quotas.listPlans(tenantId, query.year) });
  });

  app.post('/api/v1/quotas/plans', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = PlanBody.parse(request.body);
    return reply.code(201).send({ success: true, data: await quotas.createPlan(tenantId, body) });
  });

  app.patch('/api/v1/quotas/plans/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = IdParam.parse(request.params);
    const body = PlanBody.partial().parse(request.body);
    const data = await quotas.updatePlan(tenantId, id, body);
    if (!data) return reply.code(404).send({ success: false, error: 'Plan not found' });
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/quotas/plans/:id/attainment', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = IdParam.parse(request.params);
    const data = await quotas.getPlanAttainment(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Plan not found' });
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/quotas/what-if', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = z
      .object({ ownerId: z.string().min(1), dealAmounts: z.array(z.union([z.string(), z.number()])) })
      .parse(request.body);
    return reply.send({ success: true, data: await quotas.whatIfClose(tenantId, body.ownerId, body.dealAmounts) });
  });
}
