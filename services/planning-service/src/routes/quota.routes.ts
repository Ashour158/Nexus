import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { QuotaService } from '../services/quota.service.js';

/**
 * First-class Quota CRUD (per-user / per-team, per-period) plus attainment
 * history. Additive: lives alongside the older `/api/v1/quotas/plans` surface.
 *
 * NOTE: the static `/plans` and `/what-if` routes are registered separately and
 * take precedence over the `:id` param route in Fastify, so there is no clash.
 */

const OwnerType = z.enum(['USER', 'TEAM']);
const Amount = z.union([z.string(), z.number()]);

const CreateBody = z.object({
  ownerType: OwnerType.optional(),
  ownerId: z.string().min(1),
  period: z.string().min(1),
  targetAmount: Amount,
  currency: z.string().optional(),
});
const UpdateBody = CreateBody.partial();
const IdParam = z.object({ id: z.string().cuid() });

export async function registerQuotaRoutes(
  app: FastifyInstance,
  quota: QuotaService
): Promise<void> {
  app.get('/api/v1/quotas', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const q = z
      .object({ period: z.string().optional(), ownerId: z.string().optional(), ownerType: OwnerType.optional() })
      .parse(request.query);
    return reply.send({ success: true, data: await quota.list(tenantId, q) });
  });

  app.post('/api/v1/quotas', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = CreateBody.parse(request.body);
    return reply.code(201).send({ success: true, data: await quota.create(tenantId, body) });
  });

  app.get('/api/v1/quotas/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = IdParam.parse(request.params);
    const data = await quota.get(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quota not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.patch('/api/v1/quotas/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = IdParam.parse(request.params);
    const body = UpdateBody.parse(request.body);
    const data = await quota.update(tenantId, id, body);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quota not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/quotas/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = IdParam.parse(request.params);
    const ok = await quota.remove(tenantId, id);
    if (!ok) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quota not found', requestId: request.id } });
    return reply.send({ success: true, data: { id, deleted: true } });
  });

  app.get('/api/v1/quotas/:id/attainment', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = IdParam.parse(request.params);
    const data = await quota.getAttainmentHistory(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quota not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });
}
