import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { EngineContext } from '@nexus/domain-core';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

const TemplateBaseSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().optional(),
  storageKey: z.string().min(1).optional(),
  version: z.number().int().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  contentType: z.enum(['text/html', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']).optional(),
  body: z.string().optional(),
  contentBase64: z.string().optional(),
  variables: z.array(z.record(z.unknown())).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  language: z.enum(['en', 'ar']).optional(),
});

export async function registerQuoteTemplateRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer?: NexusProducer
): Promise<void> {
  const routeProducer = producer ?? ({ publish: async () => undefined } as unknown as NexusProducer);
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer: routeProducer,
    quotes: createQuotesService(prisma, routeProducer),
    discountRequests: createDiscountRequestsService(prisma, routeProducer),
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
      r.get('/quote-templates', { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await commercial.listQuoteTemplates(engineContextFromJwt(request.id, jwt));
        return reply.send({ success: true, data: rows });
      });

      r.post('/quote-templates', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = TemplateBaseSchema.parse(request.body);
        const row = await commercial.createQuoteTemplate(engineContextFromJwt(request.id, jwt), parsed);
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/quote-templates/:id', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
        const parsed = TemplateBaseSchema.partial().parse(request.body);
        const row = await commercial.updateQuoteTemplate(engineContextFromJwt(request.id, jwt), id, parsed);
        return reply.send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}

