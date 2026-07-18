import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, NotFoundError, ValidationError } from '@nexus/service-utils';
import type { BillingPrisma } from '../prisma.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const CreatePlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  // Optional plan-level tax rate as a PERCENT (e.g. 15 = 15%). When omitted the
  // renewal/trial invoices fall back to BILLING_DEFAULT_TAX_RATE_PERCENT, then 0.
  taxRate: z.number().min(0).max(100).optional(),
  interval: z.enum(['MONTHLY', 'ANNUAL', 'WEEKLY', 'DAILY']).default('MONTHLY'),
  trialDays: z.number().int().min(0).default(0),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  stripePriceId: z.string().optional(),
});

const UpdatePlanSchema = CreatePlanSchema.partial();

export async function registerPlansRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ────────────────────────────────────────────────────────────
      r.get(
        '/plans',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const plans = await prisma.plan.findMany({
            where: { tenantId: jwt.tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: plans });
        }
      );

      // ─── CREATE ──────────────────────────────────────────────────────────
      r.post(
        '/plans',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreatePlanSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const plan = await prisma.plan.create({
            data: {
              ...parsed.data,
              tenantId: jwt.tenantId,
              features: parsed.data.features,
            },
          });
          return reply.code(201).send({ success: true, data: plan });
        }
      );

      // ─── GET BY ID ───────────────────────────────────────────────────────
      r.get(
        '/plans/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const plan = await prisma.plan.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!plan) throw new NotFoundError('Plan not found');
          return reply.send({ success: true, data: plan });
        }
      );

      // ─── UPDATE ──────────────────────────────────────────────────────────
      r.patch(
        '/plans/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdatePlanSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const existing = await prisma.plan.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) throw new NotFoundError('Plan not found');
          const plan = await prisma.plan.update({
            where: { id },
            data: parsed.data,
          });
          return reply.send({ success: true, data: plan });
        }
      );

      // ─── SOFT DELETE ─────────────────────────────────────────────────────
      r.delete(
        '/plans/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const existing = await prisma.plan.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) throw new NotFoundError('Plan not found');
          await prisma.plan.update({
            where: { id },
            data: { deletedAt: new Date() },
          });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1/billing' }
  );
}
