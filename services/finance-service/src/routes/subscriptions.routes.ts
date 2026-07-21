import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  NotFoundError,
  BusinessRuleError,
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import { TOPICS } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';

/**
 * REST surface for recurring billing (audit: "absent billing/subscription
 * surface"). Subscriptions are CREATED by the commercial pipeline (contract
 * activation → commercial-records use-case), so this surface is deliberately
 * read + lifecycle only: list, detail, cancel. Editing money fields by hand
 * would bypass the contract system-of-record.
 */

const ListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  status: z
    .enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'])
    .optional(),
  accountId: z.string().optional(),
});

const IdParam = z.object({ id: z.string().min(1) });

const CancelBody = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export async function registerSubscriptionsRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/subscriptions',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const parsed = ListQuery.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const where = {
            tenantId: jwt.tenantId,
            ...(q.status ? { status: q.status } : {}),
            ...(q.accountId ? { accountId: q.accountId } : {}),
          };
          const [total, rows, totals] = await Promise.all([
            prisma.subscription.count({ where }),
            prisma.subscription.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip: (q.page - 1) * q.limit,
              take: q.limit,
              include: { contract: { select: { id: true, contractNumber: true, name: true } } },
            }),
            prisma.subscription.aggregate({
              where: { tenantId: jwt.tenantId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
              _sum: { mrr: true, arr: true },
              _count: true,
            }),
          ]);
          return reply.send({
            success: true,
            data: {
              items: rows,
              total,
              page: q.page,
              limit: q.limit,
              summary: {
                activeCount: totals._count,
                mrr: totals._sum.mrr ?? 0,
                arr: totals._sum.arr ?? 0,
              },
            },
          });
        }
      );

      r.get(
        '/subscriptions/:id',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const row = await prisma.subscription.findFirst({
            where: { id, tenantId: jwt.tenantId },
            include: {
              contract: { select: { id: true, contractNumber: true, name: true, status: true } },
              invoices: {
                select: { id: true, invoiceNumber: true, status: true, total: true, dueDate: true },
                orderBy: { createdAt: 'desc' },
                take: 12,
              },
            },
          });
          if (!row) throw new NotFoundError('Subscription', id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/subscriptions/:id/cancel',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const body = CancelBody.parse(request.body ?? {});
          const existing = await prisma.subscription.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!existing) throw new NotFoundError('Subscription', id);
          if (existing.status === 'CANCELLED') {
            throw new BusinessRuleError('Subscription is already cancelled');
          }
          const row = await prisma.subscription.update({
            where: { id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelReason: body.reason ?? null,
              nextBillingDate: null,
            },
          });
          // Durable event via the transactional outbox (same channel the
          // pipeline used for subscription.created).
          await prisma.outboxMessage
            .create({
              data: {
                topic: TOPICS.CONTRACTS,
                key: row.id,
                payload: {
                  type: 'subscription.cancelled',
                  tenantId: jwt.tenantId,
                  subscriptionId: row.id,
                  accountId: row.accountId,
                  reason: body.reason ?? null,
                  occurredAt: new Date().toISOString(),
                } as never,
                tenantId: jwt.tenantId,
                aggregateType: 'subscription',
                aggregateId: row.id,
                eventType: 'subscription.cancelled',
                status: 'PENDING',
                retryCount: 0,
              },
            })
            .catch((err: unknown) =>
              console.error('[subscriptions.routes] outbox write failed', err)
            );
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
