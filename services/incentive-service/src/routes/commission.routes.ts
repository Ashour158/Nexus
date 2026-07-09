import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createCommissionService } from '../services/commission.service.js';

type CommissionService = ReturnType<typeof createCommissionService>;

const ruleSchema = z.object({
  appliesToRole: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  ratePercent: z.union([z.string(), z.number()]),
  tierMinAmount: z.union([z.string(), z.number()]).optional(),
  tierMaxAmount: z.union([z.string(), z.number()]).optional(),
  priority: z.number().int().optional(),
});

export async function registerCommissionRoutes(app: FastifyInstance, commission: CommissionService): Promise<void> {
  const tenantOf = (request: unknown) => (request as { user: { tenantId: string } }).user.tenantId;
  const userOf = (request: unknown) => (request as { user: { tenantId: string; sub: string } }).user;

  // ── Plans + nested rules ────────────────────────────────────────────────
  app.get(
    '/api/v1/commission/plans',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.READ) },
    async (request, reply) => {
      return reply.send({ success: true, data: await commission.listPlans(tenantOf(request)) });
    },
  );

  app.get(
    '/api/v1/commission/plans/:id',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.READ) },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const plan = await commission.getPlan(tenantOf(request), id);
      if (!plan) return reply.code(404).send({ success: false, error: 'Plan not found' });
      return reply.send({ success: true, data: plan });
    },
  );

  app.post(
    '/api/v1/commission/plans',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.MANAGE) },
    async (request, reply) => {
      const body = z
        .object({
          name: z.string().min(1),
          description: z.string().optional(),
          isActive: z.boolean().optional(),
          basis: z.enum(['REVENUE', 'MARGIN']).optional(),
          effectiveFrom: z.string().datetime().optional(),
          effectiveTo: z.string().datetime().optional(),
          rules: z.array(ruleSchema).optional(),
        })
        .parse(request.body);
      return reply.code(201).send({ success: true, data: await commission.createPlan(tenantOf(request), body) });
    },
  );

  app.patch(
    '/api/v1/commission/plans/:id',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.MANAGE) },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          isActive: z.boolean().optional(),
          basis: z.enum(['REVENUE', 'MARGIN']).optional(),
          effectiveFrom: z.string().datetime().nullable().optional(),
          effectiveTo: z.string().datetime().nullable().optional(),
        })
        .parse(request.body);
      const updated = await commission.updatePlan(tenantOf(request), id, body);
      if (!updated) return reply.code(404).send({ success: false, error: 'Plan not found' });
      return reply.send({ success: true, data: updated });
    },
  );

  app.delete(
    '/api/v1/commission/plans/:id',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.MANAGE) },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const deleted = await commission.deletePlan(tenantOf(request), id);
      if (!deleted) return reply.code(404).send({ success: false, error: 'Plan not found' });
      return reply.send({ success: true, data: deleted });
    },
  );

  app.post(
    '/api/v1/commission/plans/:id/rules',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.MANAGE) },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = ruleSchema.parse(request.body);
      const rule = await commission.addRule(tenantOf(request), id, body);
      if (!rule) return reply.code(404).send({ success: false, error: 'Plan not found' });
      return reply.code(201).send({ success: true, data: rule });
    },
  );

  app.delete(
    '/api/v1/commission/rules/:ruleId',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.MANAGE) },
    async (request, reply) => {
      const { ruleId } = z.object({ ruleId: z.string().cuid() }).parse(request.params);
      const deleted = await commission.deleteRule(tenantOf(request), ruleId);
      if (!deleted) return reply.code(404).send({ success: false, error: 'Rule not found' });
      return reply.send({ success: true, data: deleted });
    },
  );

  // ── Statements ──────────────────────────────────────────────────────────
  app.get(
    '/api/v1/commission/statements',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.READ) },
    async (request, reply) => {
      const q = z
        .object({
          ownerId: z.string().optional(),
          periodMonth: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
          status: z.enum(['PENDING', 'APPROVED', 'PAID']).optional(),
        })
        .parse(request.query);
      return reply.send({ success: true, data: await commission.listStatements(tenantOf(request), q) });
    },
  );

  app.post(
    '/api/v1/commission/statements/:id/approve',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.APPROVE) },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const user = userOf(request);
      try {
        const updated = await commission.approveStatement(user.tenantId, id, user.sub);
        if (!updated) return reply.code(404).send({ success: false, error: 'Statement not found' });
        return reply.send({ success: true, data: updated });
      } catch (err) {
        return reply.code(409).send({ success: false, error: err instanceof Error ? err.message : 'Conflict' });
      }
    },
  );

  app.post(
    '/api/v1/commission/statements/:id/pay',
    { preHandler: requirePermission(PERMISSIONS.COMMISSION.APPROVE) },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      try {
        const updated = await commission.payStatement(tenantOf(request), id);
        if (!updated) return reply.code(404).send({ success: false, error: 'Statement not found' });
        return reply.send({ success: true, data: updated });
      } catch (err) {
        return reply.code(409).send({ success: false, error: err instanceof Error ? err.message : 'Conflict' });
      }
    },
  );
}
