import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { EngineContext } from '@nexus/domain-core';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

const RFQSchema = z.object({
  title: z.string().min(1),
  dealId: z.string().cuid(),
  accountId: z.string().cuid(),
  contactId: z.string().cuid().optional(),
  currency: z.string().optional(),
  requiredByDate: z.coerce.date().optional(),
  lineItems: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative().optional(),
    listPrice: z.number().nonnegative().optional(),
  }).passthrough()).min(1),
  internalNotes: z.string().optional(),
});

const RFQResponseSchema = z.record(z.string(), z.unknown()).default({});

const RFQReasonSchema = z.object({
  reason: z.string().min(1),
});

export async function registerRFQRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const engine = new CpqPricingEngine(prisma);
  const quotes = createQuotesService(prisma, producer);
  const discountRequests = createDiscountRequestsService(prisma, producer);
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes,
    discountRequests,
    pricingEngine: engine,
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

  function transitionMeta(request: { id: string; headers: Record<string, unknown> }) {
    const idempotencyKey =
      String(request.headers['idempotency-key'] ?? '').trim() ||
      String(request.headers['x-idempotency-key'] ?? '').trim() ||
      request.id;
    const correlationId =
      String(request.headers['x-correlation-id'] ?? '').trim() ||
      String(request.headers['x-request-id'] ?? '').trim() ||
      request.id;
    return { idempotencyKey, correlationId, source: 'api' };
  }

  await app.register(
    async (r) => {
      r.get('/rfqs', { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await commercial.listRfqs(engineContextFromJwt(request.id, jwt));
        return reply.send({ success: true, data: rows });
      });

      r.post('/rfqs', { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = RFQSchema.parse(request.body);
        const row = await commercial.createRfq(engineContextFromJwt(request.id, jwt), parsed);
        return reply.code(201).send({ success: true, data: row });
      });

      r.get('/rfqs/:id', { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await commercial.getRfq(engineContextFromJwt(request.id, jwt), id);
        return reply.send({ success: true, data: row });
      });

      r.patch('/rfqs/:id', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const parsed = RFQSchema.partial().parse(request.body);
        const jwt = request.user as JwtPayload;
        const row = await commercial.updateRfq(engineContextFromJwt(request.id, jwt), id, parsed);
        return reply.send({ success: true, data: row });
      });

      r.delete('/rfqs/:id', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await commercial.deleteRfq(engineContextFromJwt(request.id, jwt), id);
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/send', { preHandler: requirePermission(PERMISSIONS.QUOTES.SEND) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await commercial.sendRfq(engineContextFromJwt(request.id, jwt), id, transitionMeta(request));
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/review', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await commercial.startRfqReview(engineContextFromJwt(request.id, jwt), id, transitionMeta(request));
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/return', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const { reason } = RFQReasonSchema.parse(request.body);
        const jwt = request.user as JwtPayload;
        const row = await commercial.returnRfqForChanges(engineContextFromJwt(request.id, jwt), id, reason, transitionMeta(request));
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/respond', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const parsed = RFQResponseSchema.parse(request.body);
        const jwt = request.user as JwtPayload;
        const row = await commercial.recordRfqResponse(engineContextFromJwt(request.id, jwt), id, parsed, transitionMeta(request));
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/ready', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await commercial.markRfqReadyForQuote(engineContextFromJwt(request.id, jwt), id, transitionMeta(request));
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/cancel', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const { reason } = RFQReasonSchema.parse(request.body);
        const jwt = request.user as JwtPayload;
        const row = await commercial.cancelRfq(engineContextFromJwt(request.id, jwt), id, reason, transitionMeta(request));
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/convert', { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const result = await commercial.convertRfq(engineContextFromJwt(request.id, jwt), id, transitionMeta(request));
        return reply.send({ success: true, data: result });
      });
    },
    { prefix: '/api/v1' }
  );
}

