import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import type { EngineContext } from '@nexus/domain-core';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  CreateDiscountRequestSchema,
  DiscountRequestListQuerySchema,
} from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { createQuotesService } from '../services/quotes.service.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

export async function registerDiscountRequestRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const quotes = createQuotesService(prisma, producer);
  const discountRequests = createDiscountRequestsService(prisma, producer);
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes,
    discountRequests,
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
        '/discount-requests/reasons',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (_request, reply) => {
          return reply.send({
            success: true,
            data: commercial.reasonOptions(),
          });
        }
      );

      r.get(
        '/discount-requests',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const parsed = DiscountRequestListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const rows = await commercial.listDiscountRequests(engineContextFromJwt(request.id, jwt), parsed.data);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/discount-requests',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const parsed = CreateDiscountRequestSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const created = await commercial.createDiscountRequest(engineContextFromJwt(request.id, jwt), parsed.data);
          return reply.code(201).send({ success: true, data: created });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
