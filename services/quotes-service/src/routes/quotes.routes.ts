import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { toPaginatedResult } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import {
  IdParamSchema,
  QuoteListQuerySchema,
} from '@nexus/validation';
import type { QuotesPrisma } from '../prisma.js';
import type { Prisma, QuoteStatus } from '../../../../node_modules/.prisma/quotes-client/index.js';

function disabledQuoteMutation(requestId: string) {
  return {
    success: false,
    error: {
      code: 'QUOTE_MUTATION_MOVED',
      message: 'Quote mutations have moved to finance-service authority.',
      requestId,
      migration: 'Use finance-service RFQ, quote, DRQ, and order workflow endpoints instead of deprecated quotes-service writes.',
    },
  };
}

/**
 * Registers the `/api/v1/quotes/*` and `/api/v1/deal-rooms/*` route family.
 */
export async function registerQuotesRoutes(
  app: FastifyInstance,
  prisma: QuotesPrisma
): Promise<void> {
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
          const where: Prisma.QuoteWhereInput = { tenantId: jwt.tenantId, deletedAt: null };
          if (q.dealId) where.dealId = q.dealId;
          if (q.ownerId) where.ownerId = q.ownerId;
          if (q.status) where.status = q.status as QuoteStatus;

          const [quotes, total] = await Promise.all([
            prisma.quote.findMany({
              where,
              take: q.limit,
              skip: (q.page - 1) * q.limit,
              orderBy: { createdAt: 'desc' },
            }),
            prisma.quote.count({ where }),
          ]);

          return reply.send({ success: true, data: toPaginatedResult(quotes, total, q.page, q.limit) });
        }
      );

      // ─── CREATE ─────────────────────────────────────────────────────────
      r.post(
        '/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => reply.code(410).send(disabledQuoteMutation(request.id))
      );

      // ─── READ ───────────────────────────────────────────────────────────
      r.get(
        '/quotes/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await prisma.quote.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!quote) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Quote not found', requestId: request.id },
            });
          }
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/quotes/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          IdParamSchema.parse(request.params);
          return reply.code(410).send(disabledQuoteMutation(request.id));
        }
      );

      // ─── DELETE (soft) ──────────────────────────────────────────────────
      r.delete(
        '/quotes/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          IdParamSchema.parse(request.params);
          return reply.code(410).send(disabledQuoteMutation(request.id));
        }
      );

      // ─── DEAL ROOMS LIST ────────────────────────────────────────────────
      r.get(
        '/deal-rooms',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rooms = await prisma.dealRoom.findMany({
            where: { tenantId: jwt.tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: rooms });
        }
      );

      // ─── DEAL ROOM READ ─────────────────────────────────────────────────
      r.get(
        '/deal-rooms/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const room = await prisma.dealRoom.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
            include: { items: true, documents: true },
          });
          if (!room) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id },
            });
          }
          return reply.send({ success: true, data: room });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
