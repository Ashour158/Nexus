import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CpqPricingRequest, JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  CreateQuoteSchema,
  IdParamSchema,
  PaginationSchema,
  QuoteListQuerySchema,
  RejectQuoteSchema,
  UpdateQuoteSchema,
  VoidQuoteSchema,
} from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { createQuotesService } from '../services/quotes.service.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';

const DealParamsSchema = z.object({ dealId: z.string().cuid() });

/**
 * Registers the `/api/v1/quotes/*` route family. Quote creation runs the CPQ
 * pricing engine inline and persists the result atomically through
 * `createQuotesService.createQuote`.
 */
export async function registerQuotesRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const quotes = createQuotesService(prisma, producer);
  const engine = new CpqPricingEngine(prisma);

  await app.register(
    async (r) => {
      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const parsed = QuoteListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await quotes.listQuotes(
            jwt.tenantId,
            {
              dealId: q.dealId,
              accountId: q.accountId,
              ownerId: q.ownerId,
              status: q.status,
            },
            { page: q.page, limit: q.limit, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      // ─── CREATE (runs CPQ engine, persists quote) ───────────────────────
      r.post(
        '/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const parsed = CreateQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const input: CpqPricingRequest = {
            tenantId: jwt.tenantId,
            dealId: parsed.data.dealId,
            accountId: parsed.data.accountId,
            currency: parsed.data.currency,
            paymentTerms: parsed.data.paymentTerms,
            appliedPromos: parsed.data.appliedPromos,
            items: parsed.data.items,
          };
          const pricing = await engine.calculate(input);
          const quote = await quotes.createQuote(
            jwt.tenantId,
            parsed.data,
            pricing
          );
          return reply.code(201).send({
            success: true,
            data: { quote, pricing },
          });
        }
      );

      // ─── READ ───────────────────────────────────────────────────────────
      r.get(
        '/quotes/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await quotes.getQuoteById(jwt.tenantId, id);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/quotes/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const quote = await quotes.updateQuote(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── SEND ───────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/send',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.SEND) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await quotes.sendQuote(jwt.tenantId, id);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── ACCEPT ─────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/accept',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await quotes.acceptQuote(jwt.tenantId, id);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── REJECT ─────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/reject',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = RejectQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const quote = await quotes.rejectQuote(
            jwt.tenantId,
            id,
            parsed.data.reason
          );
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── DUPLICATE ──────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/duplicate',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await quotes.duplicateQuote(jwt.tenantId, id);
          return reply.code(201).send({ success: true, data: quote });
        }
      );

      // ─── VOID ───────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/void',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = VoidQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const quote = await quotes.voidQuote(
            jwt.tenantId,
            id,
            parsed.data.reason
          );
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── QUOTES FOR DEAL ────────────────────────────────────────────────
      r.get(
        '/deals/:dealId/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { dealId } = DealParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await quotes.listQuotes(
            jwt.tenantId,
            { dealId },
            { page: q.page, limit: q.limit, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
