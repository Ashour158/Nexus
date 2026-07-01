import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, NotFoundError, ValidationError } from '@nexus/service-utils';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import type { BillingPrisma } from '../prisma.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const CreateSubscriptionSchema = z.object({
  customerId: z.string().min(1),
  planId: z.string().cuid(),
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime(),
  trialEnd: z.string().datetime().optional(),
  stripeSubId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

const UpdateSubscriptionSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'PAST_DUE', 'TRIALING']).optional(),
  currentPeriodStart: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  trialEnd: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function registerSubscriptionsRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma,
  producer: NexusProducer
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ────────────────────────────────────────────────────────────
      r.get(
        '/subscriptions',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const subs = await prisma.subscription.findMany({
            where: { tenantId: jwt.tenantId, deletedAt: null },
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: subs });
        }
      );

      // ─── CREATE ──────────────────────────────────────────────────────────
      r.post(
        '/subscriptions',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.CREATE) },
        async (request, reply) => {
          const parsed = CreateSubscriptionSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const sub = await prisma.subscription.create({
            data: {
              ...parsed.data,
              tenantId: jwt.tenantId,
              currentPeriodStart: new Date(parsed.data.currentPeriodStart),
              currentPeriodEnd: new Date(parsed.data.currentPeriodEnd),
              trialEnd: parsed.data.trialEnd ? new Date(parsed.data.trialEnd) : undefined,
            },
            include: { plan: true },
          });
          return reply.code(201).send({ success: true, data: sub });
        }
      );

      // ─── GET BY ID ───────────────────────────────────────────────────────
      r.get(
        '/subscriptions/:id',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const sub = await prisma.subscription.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
            include: { plan: true, invoices: true },
          });
          if (!sub) throw new NotFoundError('Subscription not found');
          return reply.send({ success: true, data: sub });
        }
      );

      // ─── UPDATE (pause/resume) ────────────────────────────────────────────
      r.patch(
        '/subscriptions/:id',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateSubscriptionSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const existing = await prisma.subscription.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) throw new NotFoundError('Subscription not found');
          const sub = await prisma.subscription.update({
            where: { id },
            data: {
              ...parsed.data,
              currentPeriodStart: parsed.data.currentPeriodStart
                ? new Date(parsed.data.currentPeriodStart)
                : undefined,
              currentPeriodEnd: parsed.data.currentPeriodEnd
                ? new Date(parsed.data.currentPeriodEnd)
                : undefined,
              trialEnd: parsed.data.trialEnd ? new Date(parsed.data.trialEnd) : undefined,
            },
            include: { plan: true },
          });
          return reply.send({ success: true, data: sub });
        }
      );

      // ─── CANCEL ──────────────────────────────────────────────────────────
      r.post(
        '/subscriptions/:id/cancel',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const existing = await prisma.subscription.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) throw new NotFoundError('Subscription not found');
          const sub = await prisma.subscription.update({
            where: { id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
            },
          });
          try {
            await producer.publish(TOPICS.PAYMENTS, {
              type: 'subscription.cancelled',
              tenantId: jwt.tenantId,
              subscriptionId: id,
            });
          } catch (err) {
            app.log.warn({ err }, 'Failed to publish subscription.cancelled event');
          }
          return reply.send({ success: true, data: sub });
        }
      );
    },
    { prefix: '/api/v1/billing' }
  );
}
