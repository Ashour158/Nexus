import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { DealsPrisma } from '../prisma.js';
import { createQuoteProjectionsService } from '../services/quote-projections.service.js';

function pagination(query: unknown) {
  const q = query && typeof query === 'object' ? query as Record<string, unknown> : {};
  return {
    page: Math.max(1, Number(q.page ?? 1)),
    limit: Math.min(100, Math.max(1, Number(q.limit ?? 20))),
  };
}

export async function registerQuoteProjectionRoutes(app: FastifyInstance, prisma: DealsPrisma): Promise<void> {
  const projections = createQuoteProjectionsService(prisma);

  await app.register(
    async (r) => {
      r.get('/quote-projections/deal/:dealId', { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { dealId } = request.params as { dealId: string };
        const result = await projections.listByDeal(jwt.tenantId, dealId, pagination(request.query));
        return reply.send({ success: true, data: result });
      });

      r.get('/quote-projections/account/:accountId', { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { accountId } = request.params as { accountId: string };
        const result = await projections.listByAccount(jwt.tenantId, accountId, pagination(request.query));
        return reply.send({ success: true, data: result });
      });

      r.get('/quote-projections/contact/:contactId', { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { contactId } = request.params as { contactId: string };
        const result = await projections.listByContact(jwt.tenantId, contactId, pagination(request.query));
        return reply.send({ success: true, data: result });
      });
    },
    { prefix: process.env.DEALS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
