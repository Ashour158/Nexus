import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  requireEntitlement,
  NotFoundError,
  ValidationError,
} from '@nexus/service-utils';
import type { BillingPrisma } from '../prisma.js';
import { aggregateUnbilledUsage } from '../lib/billing-math.js';
import type { EntitlementResolver } from '@nexus/service-utils';

const RecordUsageSchema = z.object({
  subscriptionId: z.string().cuid(),
  metric: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  ts: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});

const AggregateQuerySchema = z.object({
  subscriptionId: z.string().cuid(),
  unbilledOnly: z.enum(['true', 'false']).default('true'),
});

/**
 * Usage-metering routes (COM-05). `POST /usage` records a metered datapoint;
 * `GET /usage` aggregates unbilled usage per metric (the same aggregation the
 * renewal poller folds into the next invoice).
 *
 * `POST /usage` demonstrates the reusable entitlement guard: it requires the
 * tenant's plan to include the `usage_metering` feature (403 FEATURE_NOT_ENTITLED
 * otherwise). The guard uses billing's in-process resolver — no HTTP self-call.
 */
export async function registerUsageRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma,
  entitlementResolver: EntitlementResolver
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── RECORD USAGE ────────────────────────────────────────────────────
      r.post(
        '/usage',
        {
          preHandler: [
            requirePermission(PERMISSIONS.BILLING.USAGE),
            requireEntitlement('usage_metering', { resolve: entitlementResolver }),
          ],
        },
        async (request, reply) => {
          const parsed = RecordUsageSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;

          const sub = await prisma.subscription.findFirst({
            where: { id: parsed.data.subscriptionId, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!sub) throw new NotFoundError('Subscription not found');

          const rec = await prisma.usageRecord.create({
            data: {
              tenantId: jwt.tenantId,
              subscriptionId: parsed.data.subscriptionId,
              metric: parsed.data.metric,
              quantity: parsed.data.quantity,
              unitPrice: parsed.data.unitPrice,
              ts: parsed.data.ts ? new Date(parsed.data.ts) : new Date(),
              metadata: parsed.data.metadata,
            },
          });
          return reply.code(201).send({ success: true, data: rec });
        }
      );

      // ─── AGGREGATE UNBILLED USAGE ────────────────────────────────────────
      r.get(
        '/usage',
        { preHandler: requirePermission(PERMISSIONS.BILLING.READ) },
        async (request, reply) => {
          const parsed = AggregateQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;

          const sub = await prisma.subscription.findFirst({
            where: { id: parsed.data.subscriptionId, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!sub) throw new NotFoundError('Subscription not found');

          const agg = await aggregateUnbilledUsage(prisma, {
            tenantId: jwt.tenantId,
            subscriptionId: parsed.data.subscriptionId,
            from: sub.currentPeriodStart,
            to: new Date(),
          });

          return reply.send({
            success: true,
            data: { lines: agg.lines, total: agg.total.toFixed(2), recordCount: agg.recordIds.length },
          });
        }
      );
    },
    { prefix: '/api/v1/billing' }
  );
}
