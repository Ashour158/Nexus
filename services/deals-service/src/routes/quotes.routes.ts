import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { QuoteListQuerySchema, IdParamSchema } from '@nexus/validation';
import type { DealsPrisma } from '../prisma.js';
import { createQuotesService } from '../services/quotes.service.js';

export async function registerQuotesRoutes(
  app: FastifyInstance,
  prisma: DealsPrisma
): Promise<void> {
  const quotes = createQuotesService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const parsed = QuoteListQuerySchema.safeParse(request.query);
          const jwt = request.user as JwtPayload;
          const q = parsed.success ? parsed.data : { page: 1, limit: 20, sortDir: 'desc' as const };
          const result = await quotes.listQuotes(jwt.tenantId, { dealId: (q as any).dealId, accountId: (q as any).accountId, ownerId: (q as any).ownerId, status: (q as any).status }, { page: q.page, limit: q.limit, sortDir: 'desc' });
          return reply.send({ success: true, data: result });
        }
      );

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
    },
    { prefix: process.env.DEALS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
