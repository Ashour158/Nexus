import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EngineContext } from '@nexus/domain-core';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

const QuoteIdParamsSchema = z.object({ id: z.string().min(1) });

const RenderQuoteDocumentSchema = z.object({
  templateId: z.string().optional(),
  format: z.enum(['HTML', 'PDF', 'DOCX']).default('PDF'),
});

const SendSignatureSchema = z.object({
  documentId: z.string().optional(),
  recipientName: z.string().min(1).max(200),
  recipientEmail: z.string().email(),
  expiresAt: z.string().datetime().optional(),
  provider: z.string().min(1).max(50).default('INTERNAL'),
});

const UpdateSignatureSchema = z.object({
  status: z.enum(['VIEWED', 'SIGNED', 'DECLINED', 'VOIDED', 'EXPIRED']),
  declinedReason: z.string().max(1000).optional(),
});

export async function registerQuoteDocumentRoutes(
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
        '/quotes/:id/revisions',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = QuoteIdParamsSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await commercial.listQuoteRevisions(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/quotes/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = QuoteIdParamsSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await commercial.listQuoteDocuments(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/quotes/:id/render',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamsSchema.parse(request.params);
          const parsed = RenderQuoteDocumentSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const document = await commercial.renderQuoteDocument(engineContextFromJwt(request.id, jwt), id, parsed.data);
          return reply.code(201).send({ success: true, data: document });
        }
      );

      r.get(
        '/quote-documents/:documentId/download',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { documentId } = z.object({ documentId: z.string().min(1) }).parse(request.params);
          const jwt = request.user as JwtPayload;
          const result = await commercial.downloadQuoteDocument(engineContextFromJwt(request.id, jwt), documentId);
          if (result.kind === 'binary') {
            return reply
              .header('content-type', result.contentType)
              .header('content-length', result.content.length)
              .header('content-disposition', `attachment; filename="${result.fileName}"`)
              .send(result.content);
          }
          if (result.kind === 'tracked') {
            return reply.send({ success: true, data: result.data });
          }
          return reply
            .header('content-type', 'text/html; charset=utf-8')
            .header('content-disposition', `attachment; filename="${result.fileName}"`)
            .send(result.html);
        }
      );

      r.get(
        '/quotes/:id/esign',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = QuoteIdParamsSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await commercial.listQuoteESignEnvelopes(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/quotes/:id/esign/send',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.SEND) },
        async (request, reply) => {
          const { id } = QuoteIdParamsSchema.parse(request.params);
          const parsed = SendSignatureSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const envelope = await commercial.sendQuoteForSignature(engineContextFromJwt(request.id, jwt), id, parsed.data);
          return reply.code(201).send({ success: true, data: envelope });
        }
      );

      r.patch(
        '/quote-esign/:envelopeId',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { envelopeId } = z.object({ envelopeId: z.string().min(1) }).parse(request.params);
          const parsed = UpdateSignatureSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const updated = await commercial.updateQuoteSignature(engineContextFromJwt(request.id, jwt), envelopeId, parsed.data);
          return reply.send({ success: true, data: updated });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
