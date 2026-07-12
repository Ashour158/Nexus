import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
  createHttpClient,
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
import { createDealsService } from '../services/deals.service.js';
import { createAttachmentsService } from '../services/attachments.service.js';
import { createQuoteProjectionsService } from '../services/quote-projections.service.js';
import { getFieldHistory } from '../lib/field-history.js';
import { uploadToStorage } from '../lib/storage.js';
import { createSalesRecordsUseCase } from '../use-cases/sales-records.use-case.js';
import { buildReadAccessContext } from '../lib/access-context.js';
import { interceptForReview } from '../lib/review-process.js';
import { withIdempotency } from '../lib/idempotency.js';
import type { EngineContext } from '@nexus/domain-core';

// ─── Local param schemas ────────────────────────────────────────────────────

/** Params for `/deals/:id/contacts/:contactId`. */
const DealContactParamsSchema = z.object({
  id: z.string().cuid(),
  contactId: z.string().cuid(),
});
const MassIdsSchema = z.object({ ids: z.array(z.string().cuid()).min(1).max(200) });
const DealMassUpdateSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
  data: z.object({
    ownerId: z.string().cuid().optional(),
    stageId: z.string().cuid().optional(),
    forecastCategory: z.enum(['PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED', 'OMITTED']).optional(),
  }),
});
const AttachmentBodySchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().min(0),
  mimeType: z.string().min(1),
  contentBase64: z.string().optional(),
  storageKey: z.string().optional(),
});
const AttachmentIdParamSchema = z.object({
  id: z.string().cuid(),
  attachmentId: z.string().cuid(),
});
const ConvertToRenewalSchema = z.object({
  contractEndDate: z.string().datetime().nullable().optional(),
  renewalProbability: z.number().int().min(0).max(100).nullable().optional(),
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
const dataServiceProxyClient = createHttpClient({
  baseURL: process.env.DATA_SERVICE_URL ?? 'http://localhost:3015',
});

export async function registerDealsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const deals = createDealsService(prisma, producer);
  const attachments = createAttachmentsService(prisma);
  const quoteProjections = createQuoteProjectionsService(prisma);
  const salesRecords = createSalesRecordsUseCase({
    leads: {
      create: async () => undefined,
      get: async () => ({}),
      update: async () => undefined,
      archive: async () => undefined,
      restore: async () => undefined,
      convert: async () => undefined,
      findDuplicates: async () => [],
    },
    deals: {
      create: (tenantId, data) => deals.createDeal(tenantId, data as never),
      get: (tenantId, id) => deals.getDealById(tenantId, id) as Promise<Record<string, unknown>>,
      update: (tenantId, id, data, actor, roles) => deals.updateDeal(tenantId, id, data as never, actor, roles),
      archive: (tenantId, id) => deals.deleteDeal(tenantId, id),
      restore: (tenantId, id) => deals.restoreDeal(tenantId, id),
      moveStage: (tenantId, id, stageId) => deals.moveDealToStage(tenantId, id, stageId),
      markWon: (tenantId, id) => deals.markDealWon(tenantId, id),
      markLost: (tenantId, id, reason, detail) => deals.markDealLost(tenantId, id, reason, detail),
    },
    repositories: {
      lead: prisma.lead as never,
      deal: prisma.deal as never,
    },
    recycle: async (input) => {
      await dataServiceProxyClient.post('/api/v1/recycle', input, { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` });
    },
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
        correlationId: requestId,
        source: 'api',
      },
      now: new Date(),
    };
  }

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
          const access = await buildReadAccessContext(jwt, 'deal', request.headers.authorization);
          const result = await deals.listDeals(jwt.tenantId, {
            pipelineId: q.pipelineId,
            stageId: q.stageId,
            ownerId: q.ownerId,
            accountId: q.accountId,
            status: q.status,
            search: q.search,
            minAmount: q.minAmount,
            maxAmount: q.maxAmount,
            isRenewal: q.isRenewal,
            contractEndBefore: q.contractEndBefore,
            includeDeleted: q.includeDeleted,
          }, {
            page: q.page,
            limit: q.limit,
            sortBy: q.sortBy as import('../services/deals.service.js').DealListPagination['sortBy'],
            sortDir: q.sortDir,
          }, access);
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
          const { statusCode, body } = await withIdempotency(prisma, request, jwt.tenantId, async () => {
            const deal = await salesRecords.create(engineContextFromJwt(request.id, jwt), {
              entityType: 'deal',
              data: parsed.data as Record<string, unknown>,
            });
            return { statusCode: 201, body: { success: true, data: deal } };
          });
          return reply.code(statusCode).send(body);
        }
      );

      // ─── TIMELINE ───────────────────────────────────────────────────────
      r.get(
        '/deals/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'deal', id, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/deals/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'deal', id, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/deals/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const body = AttachmentBodySchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const storageKey = body.storageKey ?? (await uploadToStorage({
            fileName: body.fileName,
            mimeType: body.mimeType,
            contentBase64: body.contentBase64,
          }));
          const data = await attachments.createAttachment(
            jwt.tenantId,
            'deal',
            id,
            {
              fileName: body.fileName,
              fileSize: body.fileSize,
              mimeType: body.mimeType,
              storageKey,
            },
            jwt.sub
          );
          return reply.code(201).send({ success: true, data });
        }
      );

      r.post(
        '/deals/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const body = AttachmentBodySchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const storageKey = body.storageKey ?? (await uploadToStorage({
            fileName: body.fileName,
            mimeType: body.mimeType,
            contentBase64: body.contentBase64,
          }));
          const data = await attachments.createAttachment(
            jwt.tenantId,
            'deal',
            id,
            {
              fileName: body.fileName,
              fileSize: body.fileSize,
              mimeType: body.mimeType,
              storageKey,
            },
            jwt.sub
          );
          return reply.code(201).send({ success: true, data });
        }
      );

      r.get(
        '/deals/:id/field-history',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await deals.getDealById(jwt.tenantId, id);
          const data = await getFieldHistory(prisma, jwt.tenantId, 'deal', id);
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/deals/:id/audit',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await deals.getDealById(jwt.tenantId, id);
          const [fieldChanges, attachmentsRows] = await Promise.all([
            getFieldHistory(prisma, jwt.tenantId, 'deal', id),
            prisma.attachment.findMany({
              where: { tenantId: jwt.tenantId, module: 'deal', recordId: id },
              orderBy: { createdAt: 'desc' },
              take: 50,
            }),
          ]);
          const data = [
            ...fieldChanges.map((item) => ({
              id: item.id,
              type: 'field.changed',
              actorId: item.changedBy,
              actorName: item.changedByName,
              description: `${item.fieldName} changed`,
              createdAt: item.changedAt,
              metadata: item,
            })),
            ...attachmentsRows.map((item) => ({
              id: item.id,
              type: 'document.attached',
              actorId: item.uploadedBy,
              actorName: null,
              description: `${item.fileName} attached`,
              createdAt: item.createdAt,
              metadata: item,
            })),
          ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/deals/:id/outbox',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await deals.getDealById(jwt.tenantId, id);
          const data = await prisma.outboxMessage.findMany({
            where: {
              OR: [
                { aggregateId: id },
                { payload: { path: ['payload', 'dealId'], equals: id } },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/deals/:id/attachments/:attachmentId',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const p = AttachmentIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await attachments.deleteAttachment(jwt.tenantId, p.attachmentId);
          if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attachment not found', requestId: request.id } });
          return reply.send({ success: true, data });
        }
      );

      r.patch(
        '/deals/mass-update',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const body = DealMassUpdateSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await salesRecords.massUpdate(engineContextFromJwt(request.id, jwt), {
            entityType: 'deal',
            ids: body.ids,
            data: body.data,
          });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/deals/mass-delete',
        { preHandler: requirePermission(PERMISSIONS.DEALS.DELETE) },
        async (request, reply) => {
          const body = MassIdsSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await salesRecords.massArchive(engineContextFromJwt(request.id, jwt), {
            entityType: 'deal',
            ids: body.ids,
          });
          return reply.send({ success: true, data });
        }
      );

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

      // ─── QUOTES (finance quote-projection read-model) ───────────────────
      // Reads the local crm-service QuoteProjection read-model (migrated from
      // deals-service). No HTTP hop — direct Prisma via the projections service.
      // Both paths share the same handler: `/deals/:id/quotes` (existing web
      // contract) and `/deals/:id/quote-projections` (canonical shape).
      for (const quotesPath of ['/deals/:id/quotes', '/deals/:id/quote-projections'] as const) {
        r.get(
          quotesPath,
          { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
          async (request, reply) => {
            const { id } = IdParamSchema.parse(request.params);
            const q = PaginationSchema.parse(request.query);
            const jwt = request.user as JwtPayload;
            const data = await quoteProjections.listByDeal(jwt.tenantId, id, {
              page: q.page,
              limit: q.limit,
            });
            return reply.send({ success: true, data });
          }
        );
      }

      // ─── SCORING INSIGHTS (deterministic signals — no AI) ───────────────
      r.get(
        '/deals/:id/scoring-insights',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await deals.getDealScoringInsights(jwt.tenantId, id);
          return reply.send({ success: true, data });
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
          const deal = await salesRecords.moveDealStage(engineContextFromJwt(request.id, jwt), {
            dealId: id,
            stageId: parsed.data.stageId,
          });
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
          const deal = await salesRecords.markDealWon(engineContextFromJwt(request.id, jwt), { dealId: id });
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
          const deal = await salesRecords.markDealLost(engineContextFromJwt(request.id, jwt), {
            dealId: id,
            reason: parsed.data.reason,
            detail: parsed.data.detail,
          });
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
          const access = await buildReadAccessContext(jwt, 'deal', request.headers.authorization);
          const deal = await deals.getDealById(jwt.tenantId, id, access);
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
          // Maker-checker: if a review process gates any edited field, divert the
          // whole change into a PendingChange and return 202 instead of writing.
          const review = await interceptForReview(prisma, {
            tenantId: jwt.tenantId,
            module: 'deal',
            recordId: id,
            changes: parsed.data as Record<string, unknown>,
            submittedById: jwt.sub,
          });
          if (review) {
            return reply.code(202).send({ success: true, pendingChangeId: review.pendingChangeId, requiresReview: true });
          }
          const deal = await salesRecords.update(engineContextFromJwt(request.id, jwt), {
            entityType: 'deal',
            id,
            data: parsed.data as Record<string, unknown>,
          });
          return reply.send({ success: true, data: deal });
        }
      );

      r.post(
        '/deals/:id/clone',
        { preHandler: requirePermission(PERMISSIONS.DEALS.CREATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const Body = z.object({ name: z.string().max(200).optional() });
          const parsed = Body.safeParse(request.body ?? {});
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const deal = await deals.cloneDeal(jwt.tenantId, id, parsed.data.name);
          return reply.code(201).send({ success: true, data: deal });
        }
      );

      // ─── CONVERT TO RENEWAL ─────────────────────────────────────────────
      r.post(
        '/deals/:id/convert-to-renewal',
        { preHandler: requirePermission(PERMISSIONS.DEALS.CREATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = ConvertToRenewalSchema.safeParse(request.body ?? {});
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const deal = await deals.convertDealToRenewal(jwt.tenantId, id, parsed.data);
          return reply.code(201).send({ success: true, data: deal });
        }
      );

      // ─── DELETE (soft) ──────────────────────────────────────────────────
      r.delete(
        '/deals/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await salesRecords.archive(engineContextFromJwt(request.id, jwt), { entityType: 'deal', id });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/deals/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const deal = await salesRecords.restore(engineContextFromJwt(request.id, jwt), { entityType: 'deal', id });
          return reply.send({ success: true, data: deal });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
