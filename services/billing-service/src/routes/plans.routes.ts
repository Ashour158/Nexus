import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { CreatePlanSchema, IdParamSchema, UpdatePlanSchema } from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/billing-client/index.js';
import type { createPlansService } from '../services/plans.service.js';

export async function registerPlansRoutes(
  app: FastifyInstance,
  plans: ReturnType<typeof createPlansService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/billing/plans', async (_request, reply) => {
        const rows = await plans.listPlans();
        return reply.send({ success: true, data: rows });
      });

      r.get(
        '/billing/plans/:id',
        { preHandler: requirePermission(PERMISSIONS.BILLING.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const row = await plans.getPlanById(id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/billing/plans',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const parsed = CreatePlanSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await plans.createPlan({
            ...parsed.data,
            basePrice: new Prisma.Decimal(parsed.data.basePrice),
            features: (parsed.data.features ?? []) as Prisma.InputJsonValue,
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/billing/plans/:id',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdatePlanSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const body = parsed.data;
          const { basePrice: bp, features: feat, ...rest } = body;
          const row = await plans.updatePlan(id, {
            ...rest,
            ...(bp !== undefined ? { basePrice: new Prisma.Decimal(String(bp)) } : {}),
            ...(feat !== undefined ? { features: feat as Prisma.InputJsonValue } : {}),
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/billing/plans/:id',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const row = await plans.deletePlan(id);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
