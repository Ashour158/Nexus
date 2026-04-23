import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  AddDealContactSchema,
  CreateDealSchema,
  DealListQuerySchema,
  IdParamSchema,
  MarkDealLostSchema,
  MeddicicDataSchema,
  MoveDealStageSchema,
  PaginationSchema,
  UpdateDealSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import {
  createDealsService,
  type DealListFilters,
} from '../services/deals.service.js';

// ─── Local param schemas ────────────────────────────────────────────────────

/** Params for `/deals/:id/contacts/:contactId`. */
const DealContactParamsSchema = z.object({
  id: z.string().cuid(),
  contactId: z.string().cuid(),
});

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Registers the `/api/v1/deals/*` route family (Section 34.2 → "Deals").
 *
 * All routes require an authenticated JWT (supplied by the service-level
 * `authHook`) and a per-route permission check from Section 35.2. Tenant
 * isolation flows automatically via the Prisma `$extends` guard in
 * {@link CrmPrisma}, but every handler still asserts `tenantId` on the
 * inputs it passes to the service layer to keep the contract explicit.
 */
export async function registerDealsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const deals = createDealsService(prisma, producer);

  await app.register(
    async (r) => {
      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/deals',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const parsed = DealListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const ALLOWED_SORT = [
            'createdAt',
            'updatedAt',
            'amount',
            'expectedCloseDate',
          ] as const;
          const narrowedSortBy = ALLOWED_SORT.find((f) => f === q.sortBy);
          const filters: DealListFilters = {
            pipelineId: q.pipelineId,
            stageId: q.stageId,
            ownerId: q.ownerId,
            accountId: q.accountId,
            status: q.status,
            search: q.search,
            minAmount: q.minAmount,
            maxAmount: q.maxAmount,
            includeDeleted: q.includeDeleted,
          };
          const result = await deals.listDeals(jwt.tenantId, filters, {
            page: q.page,
            limit: q.limit,
            sortBy: narrowedSortBy,
            sortDir: q.sortDir,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── CREATE ─────────────────────────────────────────────────────────
      r.post(
        '/deals',
        { preHandler: requirePermission(PERMISSIONS.DEALS.CREATE) },
        async (request, reply) => {
          const parsed = CreateDealSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const deal = await deals.createDeal(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: deal });
        }
      );

      // ─── TIMELINE ───────────────────────────────────────────────────────
      r.get(
        '/deals/:id/timeline',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await deals.getDealTimeline(jwt.tenantId, id, {
            page: q.page,
            limit: q.limit,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── CONTACTS — list ────────────────────────────────────────────────
      r.get(
        '/deals/:id/contacts',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await deals.listDealContacts(jwt.tenantId, id);
          return reply.send({ success: true, data: rows });
        }
      );

      // ─── CONTACTS — add ─────────────────────────────────────────────────
      r.post(
        '/deals/:id/contacts',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = AddDealContactSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const { contactId, role, isPrimary } = parsed.data;
          const link = await deals.addContactToDeal(
            jwt.tenantId,
            id,
            contactId,
            role,
            isPrimary
          );
          return reply.code(201).send({ success: true, data: link });
        }
      );

      // ─── CONTACTS — remove ──────────────────────────────────────────────
      r.delete(
        '/deals/:id/contacts/:contactId',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id, contactId } = DealContactParamsSchema.parse(
            request.params
          );
          const jwt = request.user as JwtPayload;
          await deals.removeContactFromDeal(jwt.tenantId, id, contactId);
          return reply.send({
            success: true,
            data: { dealId: id, contactId, removed: true },
          });
        }
      );

      // ─── QUOTES ─────────────────────────────────────────────────────────
      r.get(
        '/deals/:id/quotes',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await deals.listDealQuotes(jwt.tenantId, id, {
            page: q.page,
            limit: q.limit,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── AI INSIGHTS ────────────────────────────────────────────────────
      r.get(
        '/deals/:id/ai-insights',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const insights = await deals.getDealAiInsights(jwt.tenantId, id);
          return reply.send({ success: true, data: insights });
        }
      );

      // ─── STAGE MOVE ─────────────────────────────────────────────────────
      r.patch(
        '/deals/:id/stage',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = MoveDealStageSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const deal = await deals.moveDealToStage(
            jwt.tenantId,
            id,
            parsed.data.stageId
          );
          return reply.send({ success: true, data: deal });
        }
      );

      // ─── MEDDIC UPDATE ──────────────────────────────────────────────────
      r.patch(
        '/deals/:id/meddic',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = MeddicicDataSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const deal = await deals.updateMeddic(
            jwt.tenantId,
            id,
            parsed.data
          );
          return reply.send({ success: true, data: deal });
        }
      );

      // ─── WON ────────────────────────────────────────────────────────────
      r.post(
        '/deals/:id/won',
        { preHandler: requirePermission(PERMISSIONS.DEALS.WIN) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const deal = await deals.markDealWon(jwt.tenantId, id);
          return reply.send({ success: true, data: deal });
        }
      );

      // ─── LOST ───────────────────────────────────────────────────────────
      r.post(
        '/deals/:id/lost',
        { preHandler: requirePermission(PERMISSIONS.DEALS.WIN) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = MarkDealLostSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const deal = await deals.markDealLost(
            jwt.tenantId,
            id,
            parsed.data.reason,
            parsed.data.detail
          );
          return reply.send({ success: true, data: deal });
        }
      );

      // ─── DETAIL ─────────────────────────────────────────────────────────
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

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/deals/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateDealSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const deal = await deals.updateDeal(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: deal });
        }
      );

      // ─── DELETE (soft) ──────────────────────────────────────────────────
      r.delete(
        '/deals/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await deals.deleteDeal(jwt.tenantId, id);
          return reply.send({
            success: true,
            data: { id, deleted: true },
          });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
