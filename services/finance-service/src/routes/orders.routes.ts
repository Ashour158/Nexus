import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { EngineContext } from '@nexus/domain-core';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

const OrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  quoteId: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'FULFILLING', 'FULFILLED', 'CANCELLED', 'CLOSED']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

const UpdateOrderSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'FULFILLING', 'FULFILLED', 'CANCELLED', 'CLOSED']).optional(),
    expectedFulfillmentAt: z.string().datetime().nullable().optional(),
    lineItems: z.array(z.record(z.unknown())).optional(),
    subtotal: z.number().nonnegative().optional(),
    taxAmount: z.number().nonnegative().optional(),
    discountAmount: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    customFields: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const CancelOrderSchema = z.object({
  reason: z.string().min(1),
});

const CreateOrderSchema = z.object({
  accountId: z.string().min(1),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  quoteId: z.string().optional(),
  sourceType: z.literal('MANUAL').default('MANUAL'),
  ownerId: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'FULFILLING', 'FULFILLED', 'CANCELLED', 'CLOSED']).default('DRAFT'),
  currency: z.string().min(3).max(3).default('USD'),
  subtotal: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  orderedAt: z.string().datetime().optional(),
  expectedFulfillmentAt: z.string().datetime().optional(),
  lineItems: z.array(z.record(z.unknown())).default([]),
  customFields: z.record(z.unknown()).default({}),
});

export async function registerOrdersRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes: createQuotesService(prisma, producer),
    discountRequests: createDiscountRequestsService(prisma, producer),
    pricingEngine: new CpqPricingEngine(prisma),
    checkDiscountApproval,
  });

  function engineContextFromJwt(requestId: string, jwt: JwtPayload): EngineContext {
    return {
      audit: {
        actor: {
          userId: jwt.sub,
          tenantId: jwt.tenantId,
          email: jwt.email,
          roles: jwt.roles ?? [],
          permissions: jwt.permissions ?? [],
        },
        requestId,
        source: 'api',
      },
      now: new Date(),
    };
  }

  await app.register(
    async (r) => {
      r.get(
        '/orders',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const parsed = OrderListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const result = await commercial.listOrders(engineContextFromJwt(request.id, jwt), parsed.data);
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/orders/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
          const jwt = request.user as JwtPayload;
          const order = await commercial.getOrder(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: order });
        }
      );

      r.post(
        '/orders',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const parsed = CreateOrderSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const order = await commercial.createOrder(engineContextFromJwt(request.id, jwt), parsed.data);
          return reply.code(201).send({ success: true, data: order });
        }
      );

      r.patch(
        '/orders/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
          const parsed = UpdateOrderSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const order = await commercial.updateOrder(engineContextFromJwt(request.id, jwt), id, parsed.data);
          return reply.send({ success: true, data: order });
        }
      );

      r.post(
        '/orders/:id/cancel',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
          const parsed = CancelOrderSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const order = await commercial.cancelOrder(engineContextFromJwt(request.id, jwt), id, parsed.data.reason);
          return reply.send({ success: true, data: order });
        }
      );

      r.post(
        '/quotes/:id/convert-order',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
          const jwt = request.user as JwtPayload;
          const order = await commercial.convertQuoteToOrder(engineContextFromJwt(request.id, jwt), id);
          return reply.code(201).send({ success: true, data: order });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
