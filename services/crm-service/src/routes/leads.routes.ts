import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  ConflictError,
  PERMISSIONS,
  requirePermission,
  ValidationError,
  createHttpClient,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  ConvertLeadSchema,
  CreateLeadSchema,
  IdParamSchema,
  LeadListQuerySchema,
  PaginationSchema,
  UpdateLeadSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createLeadsService } from '../services/leads.service.js';
import { createAttachmentsService } from '../services/attachments.service.js';
import { getFieldHistory } from '../lib/field-history.js';
import { uploadToStorage } from '../lib/storage.js';
import { createSalesRecordsUseCase } from '../use-cases/sales-records.use-case.js';
import type { EngineContext } from '@nexus/domain-core';

const MassIdsSchema = z.object({ ids: z.array(z.string().cuid()).min(1).max(200) });
const LeadMassUpdateSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
  data: z.object({
    ownerId: z.string().cuid().optional(),
    status: z.enum(['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).optional(),
    rating: z.enum(['HOT', 'WARM', 'COLD']).optional(),
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
const LeadStatusEnum = z.enum([
  'NEW',
  'ASSIGNED',
  'WORKING',
  'QUALIFIED',
  'UNQUALIFIED',
  'CONVERTED',
]);
const LeadStatusBodySchema = z.object({ status: LeadStatusEnum });

/**
 * Registers the `/api/v1/leads/*` route family — Section 34.2 → "Leads".
 */
const dataServiceProxyClient = createHttpClient({
  baseURL: process.env.DATA_SERVICE_URL ?? 'http://localhost:3015',
});

export async function registerLeadsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const leads = createLeadsService(prisma, producer);
  const attachments = createAttachmentsService(prisma);
  const salesRecords = createSalesRecordsUseCase({
    leads: {
      create: (tenantId, data, force) => leads.createLead(tenantId, data as never, force),
      get: (tenantId, id) => leads.getLeadById(tenantId, id) as Promise<Record<string, unknown>>,
      update: (tenantId, id, data, userId, userName, roles) => leads.updateLead(tenantId, id, data as never, userId, userName, roles),
      archive: (tenantId, id) => leads.deleteLead(tenantId, id),
      restore: (tenantId, id) => leads.restoreLead(tenantId, id),
      convert: (tenantId, id, data) => leads.convertLead(tenantId, id, data as never),
      findDuplicates: (tenantId, data) => leads.findDuplicateLeads(tenantId, data),
    },
    deals: {
      create: async () => undefined,
      get: async () => ({}),
      update: async () => undefined,
      archive: async () => undefined,
      restore: async () => undefined,
      moveStage: async () => undefined,
      markWon: async () => undefined,
      markLost: async () => undefined,
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
      r.get(
        '/leads',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const parsed = LeadListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await leads.listLeads(
            jwt.tenantId,
            {
              ownerId: q.ownerId,
              status: q.status,
              source: q.source,
              rating: q.rating,
              search: q.search,
            },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/leads',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CREATE) },
        async (request, reply) => {
          const parsed = CreateLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const force = (request.query as Record<string, string>)?.force === 'true';
          try {
            const lead = await salesRecords.create(engineContextFromJwt(request.id, jwt), {
              entityType: 'lead',
              data: parsed.data as Record<string, unknown>,
              force,
            });
            return reply.code(201).send({ success: true, data: lead });
          } catch (err) {
            if (err instanceof ConflictError && (err as any).duplicates) {
              return reply.code(409).send({
                success: false,
                error: {
                  code: 'DUPLICATE',
                  message: 'Possible duplicates found',
                  details: { duplicates: (err as any).duplicates },
                },
              });
            }
            throw err;
          }
        }
      );

      r.post(
        '/leads/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
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
            'lead',
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
        '/leads/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'lead', id, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/leads/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'lead', id, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/leads/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
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
            'lead',
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
        '/leads/:id/field-history',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await leads.getLeadById(jwt.tenantId, id);
          const data = await getFieldHistory(prisma, jwt.tenantId, 'lead', id);
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/leads/:id/audit',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await leads.getLeadById(jwt.tenantId, id);
          const [fieldChanges, attachmentsRows] = await Promise.all([
            getFieldHistory(prisma, jwt.tenantId, 'lead', id),
            prisma.attachment.findMany({
              where: { tenantId: jwt.tenantId, module: 'lead', recordId: id },
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
        '/leads/:id/outbox',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await leads.getLeadById(jwt.tenantId, id);
          const data = await prisma.outboxMessage.findMany({
            where: {
              OR: [
                { aggregateId: id },
                { payload: { path: ['payload', 'leadId'], equals: id } },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/leads/:id/duplicates',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await salesRecords.checkLeadDuplicates(engineContextFromJwt(request.id, jwt), { leadId: id });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/leads/:id/attachments/:attachmentId',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const p = AttachmentIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await attachments.deleteAttachment(jwt.tenantId, p.attachmentId);
          if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attachment not found', requestId: request.id } });
          return reply.send({ success: true, data });
        }
      );

      r.patch(
        '/leads/mass-update',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const body = LeadMassUpdateSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await salesRecords.massUpdate(engineContextFromJwt(request.id, jwt), {
            entityType: 'lead',
            ids: body.ids,
            data: body.data,
          });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/leads/mass-delete',
        { preHandler: requirePermission(PERMISSIONS.LEADS.DELETE) },
        async (request, reply) => {
          const body = MassIdsSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await salesRecords.massArchive(engineContextFromJwt(request.id, jwt), {
            entityType: 'lead',
            ids: body.ids,
          });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/leads/:id/convert',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CONVERT) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = ConvertLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const result = await salesRecords.convertLead(engineContextFromJwt(request.id, jwt), {
            leadId: id,
            data: parsed.data as Record<string, unknown>,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── STATUS (Kanban) ────────────────────────────────────────────────
      // Web `useUpdateLeadStatus` PATCHes here when a card is dragged between
      // columns. Delegates to the status-transition service, which emits
      // `lead.updated` and (for QUALIFIED/UNQUALIFIED) `lead.qualified`.
      r.patch(
        '/leads/:id/status',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = LeadStatusBodySchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const lead = await leads.transitionLeadStatus(
            jwt.tenantId,
            id,
            parsed.data.status,
            jwt.sub,
            jwt.email,
            jwt.roles ?? []
          );
          return reply.send({ success: true, data: lead });
        }
      );

      // ─── QUALIFY ────────────────────────────────────────────────────────
      r.post(
        '/leads/:id/qualify',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const lead = await leads.transitionLeadStatus(
            jwt.tenantId,
            id,
            'QUALIFIED',
            jwt.sub,
            jwt.email,
            jwt.roles ?? []
          );
          return reply.send({ success: true, data: lead });
        }
      );

      // ─── DISQUALIFY ─────────────────────────────────────────────────────
      r.post(
        '/leads/:id/disqualify',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const lead = await leads.transitionLeadStatus(
            jwt.tenantId,
            id,
            'UNQUALIFIED',
            jwt.sub,
            jwt.email,
            jwt.roles ?? []
          );
          return reply.send({ success: true, data: lead });
        }
      );

      r.get(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const lead = await leads.getLeadById(jwt.tenantId, id);
          return reply.send({ success: true, data: lead });
        }
      );

      r.patch(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const lead = await salesRecords.update(engineContextFromJwt(request.id, jwt), {
            entityType: 'lead',
            id,
            data: parsed.data as Record<string, unknown>,
          });
          return reply.send({ success: true, data: lead });
        }
      );

      r.delete(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await salesRecords.archive(engineContextFromJwt(request.id, jwt), { entityType: 'lead', id });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/leads/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const lead = await salesRecords.restore(engineContextFromJwt(request.id, jwt), { entityType: 'lead', id });
          return reply.send({ success: true, data: lead });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
