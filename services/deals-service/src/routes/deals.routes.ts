import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  CreateDealSchema,
  DealListQuerySchema,
  IdParamSchema,
  MoveDealStageSchema,
  UpdateDealSchema,
} from '@nexus/validation';
import type { DealsPrisma } from '../prisma.js';
import { createDealsService } from '../services/deals.service.js';
import type { NexusProducer } from '@nexus/kafka';

export async function registerDealsRoutes(
  app: FastifyInstance,
  prisma: DealsPrisma,
  producer: NexusProducer
): Promise<void> {
  const deals = createDealsService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/deals',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const parsed = DealListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await deals.listDeals(jwt.tenantId, { pipelineId: q.pipelineId, stageId: q.stageId, ownerId: q.ownerId, accountId: q.accountId, status: q.status, search: q.search, minAmount: q.minAmount, maxAmount: q.maxAmount, includeDeleted: q.includeDeleted }, { page: q.page, limit: q.limit, sortBy: q.sortBy as any, sortDir: q.sortDir });
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/deals',
        { preHandler: requirePermission(PERMISSIONS.DEALS.CREATE) },
        async (request, reply) => {
          const parsed = CreateDealSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const deal = await deals.createDeal(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: deal });
        }
      );

      r.get(
        '/forecast',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const forecast = await deals.getForecast(jwt.tenantId);
          return reply.send({ success: true, data: forecast });
        }
      );

      r.get(
        '/deals/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const deal = await deals.getDealById(jwt.tenantId, id);
          return reply.send({ success: true, data: deal });
        }
      );

      r.patch(
        '/deals/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateDealSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const deal = await deals.updateDeal(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: deal });
        }
      );

      r.delete(
        '/deals/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await deals.deleteDeal(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      r.patch(
        '/deals/:id/stage',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = MoveDealStageSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const deal = await deals.moveDealToStage(jwt.tenantId, id, parsed.data.stageId);
          return reply.send({ success: true, data: deal });
        }
      );
    },
    { prefix: process.env.DEALS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
