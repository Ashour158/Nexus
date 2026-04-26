import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import {
  CreateSubscriptionSchema,
  RecordUsageSchema,
  UpdateSubscriptionSchema,
} from '@nexus/validation';
import { z } from 'zod';
import type { createSubscriptionsService } from '../services/subscriptions.service.js';

const UsagePeriodQuery = z.object({
  from: z.string(),
  to: z.string(),
});

export async function registerSubscriptionsRoutes(
  app: FastifyInstance,
  subscriptions: ReturnType<typeof createSubscriptionsService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/billing/subscriptions',
        { preHandler: requirePermission(PERMISSIONS.BILLING.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const row = await subscriptions.getSubscription(jwt.tenantId);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/billing/subscriptions',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const parsed = CreateSubscriptionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await subscriptions.createSubscription(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/billing/subscriptions',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const parsed = UpdateSubscriptionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await subscriptions.updateSubscription(jwt.tenantId, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/billing/subscriptions',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const row = await subscriptions.cancelSubscription(jwt.tenantId);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/billing/subscriptions/usage',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const parsed = RecordUsageSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await subscriptions.recordUsage(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/billing/subscriptions/usage',
        { preHandler: requirePermission(PERMISSIONS.BILLING.READ) },
        async (request, reply) => {
          const parsed = UsagePeriodQuery.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await subscriptions.getUsageSummary(jwt.tenantId, parsed.data);
          return reply.send({ success: true, data: rows });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
