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
  ContactListQuerySchema,
  CreateContactSchema,
  IdParamSchema,
  PaginationSchema,
  UpdateContactSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createContactsService } from '../services/contacts.service.js';
import { createAttachmentsService } from '../services/attachments.service.js';
import { getFieldHistory } from '../lib/field-history.js';
import { uploadToStorage } from '../lib/storage.js';
import { createCustomerRecordsUseCase } from '../use-cases/customer-records.use-case.js';
import { buildReadAccessContext } from '../lib/access-context.js';
import { interceptForReview } from '../lib/review-process.js';
import { withIdempotency } from '../lib/idempotency.js';
import type { EngineContext } from '@nexus/domain-core';

const ContactDealsPaginationQuery = PaginationSchema.pick({ page: true, limit: true });
const MassIdsSchema = z.object({ ids: z.array(z.string().cuid()).min(1).max(200) });
const ContactMassUpdateSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
  data: z.object({
    ownerId: z.string().cuid().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.unknown()).optional(),
  }),
});
const MergeContactsSchema = z.object({
  primaryId: z.string().cuid(),
  secondaryId: z.string().cuid(),
  fieldChoices: z.record(z.string()).optional(),
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

const ExternalIdParamSchema = z.object({ id: z.string().min(1) });

/**
 * Registers the `/api/v1/contacts/*` route family — Section 34.2 → "Contacts".
 */
const dataServiceProxyClient = createHttpClient({
  baseURL: process.env.DATA_SERVICE_URL ?? 'http://localhost:3015',
});

export async function registerContactsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const contacts = createContactsService(prisma, producer);
  const attachments = createAttachmentsService(prisma);
  const customerRecords = createCustomerRecordsUseCase({
    services: {
      contact: {
        create: (tenantId, data) => contacts.createContact(tenantId, data as never),
        get: (tenantId, id) => contacts.getContactById(tenantId, id) as Promise<Record<string, unknown>>,
        update: (tenantId, id, updates, userId, userName, roles) => contacts.updateContact(tenantId, id, updates as never, userId, userName, roles),
        archive: (tenantId, id) => contacts.deleteContact(tenantId, id),
        restore: (tenantId, id) => contacts.restoreContact(tenantId, id),
      },
      account: {
        create: async () => undefined,
        get: async () => ({}),
        update: async () => undefined,
        archive: async () => undefined,
        restore: async () => undefined,
      },
    },
    repositories: {
      contact: prisma.contact as never,
      account: prisma.account as never,
    },
    leadRepository: prisma.lead as never,
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
        '/contacts',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const parsed = ContactListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const access = await buildReadAccessContext(jwt, 'contact', request.headers.authorization);
          const result = await contacts.listContacts(jwt.tenantId, {
            accountId: q.accountId,
            ownerId: q.ownerId,
            search: q.search,
            isActive: q.isActive,
          }, {
            page: q.page,
            limit: q.limit,
            sortBy: q.sortBy,
            sortDir: q.sortDir,
          }, access);
          return reply.send({ success: true, data: result });
        }
      );

      r.get('/duplicates/check', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const {
          email,
          phone,
          firstName,
          lastName,
          type = 'contact',
        } = request.query as Record<string, string>;

        const results = type === 'contact' || type === 'lead'
          ? await customerRecords.checkPersonDuplicates(engineContextFromJwt(request.id, jwt), { type, email, phone, firstName, lastName })
          : [];

        return reply.send({ success: true, data: { duplicates: results } });
      });

      r.post(
        '/contacts',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateContactSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const { statusCode, body } = await withIdempotency(prisma, request, jwt.tenantId, async () => {
            const contact = await customerRecords.create(engineContextFromJwt(request.id, jwt), {
              entityType: 'contact',
              data: parsed.data as Record<string, unknown>,
            });
            return { statusCode: 201, body: { success: true, data: contact } };
          });
          return reply.code(statusCode).send(body);
        }
      );

      r.get(
        '/contacts/:id/email-threads',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const data = await prisma.emailThread.findMany({
            where: { tenantId: jwt.tenantId, contactId: id },
            include: { messages: { orderBy: { sentAt: 'desc' }, take: 50 } },
            orderBy: { lastMessageAt: 'desc' },
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/contacts/:id/mail',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await prisma.emailThread.findMany({
            where: { tenantId: jwt.tenantId, contactId: id },
            include: { messages: { orderBy: { sentAt: 'desc' } } },
            orderBy: { lastMessageAt: 'desc' },
          });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/contacts/:id/deals',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParamSchema.parse(request.params);
          const q = ContactDealsPaginationQuery.safeParse(request.query);
          const pagination = q.success ? q.data : { page: 1, limit: 25 };
          const result = await contacts.listContactDeals(jwt.tenantId, id, pagination);
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/contacts/:id/timeline',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParamSchema.parse(request.params);
          const result = await contacts.getContactTimeline(jwt.tenantId, id);
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/contacts/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'contact', id, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/contacts/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'contact', id, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/contacts/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
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
            'contact',
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
        '/contacts/:id/field-history',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = ExternalIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await getFieldHistory(prisma, jwt.tenantId, 'contact', id);
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/contacts/:id/audit',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = ExternalIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const [fieldChanges, attachmentsRows] = await Promise.all([
            getFieldHistory(prisma, jwt.tenantId, 'contact', id),
            prisma.attachment.findMany({
              where: { tenantId: jwt.tenantId, module: 'contact', recordId: id },
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
        '/contacts/:id/outbox',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = ExternalIdParamSchema.parse(request.params);
          const data = await prisma.outboxMessage.findMany({
            where: {
              tenantId: jwt.tenantId,
              OR: [
                { aggregateId: id },
                { payload: { path: ['payload', 'contactId'], equals: id } },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          });
          return reply.send({
            success: true,
            data: data.filter((item) => item.aggregateId === id || JSON.stringify(item.payload).includes(id)),
          });
        }
      );

      r.post(
        '/contacts/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const body = AttachmentBodySchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const storageKey = body.storageKey ?? (await uploadToStorage({
            fileName: body.fileName,
            mimeType: body.mimeType,
            contentBase64: body.contentBase64,
          }));
          const uploadedBy = jwt.sub;
          const data = await attachments.createAttachment(
            jwt.tenantId,
            'contact',
            id,
            {
              fileName: body.fileName,
              fileSize: body.fileSize,
              mimeType: body.mimeType,
              storageKey,
            },
            uploadedBy
          );
          return reply.code(201).send({ success: true, data });
        }
      );

      r.delete(
        '/contacts/:id/attachments/:attachmentId',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const p = AttachmentIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await attachments.deleteAttachment(jwt.tenantId, p.attachmentId);
          if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          return reply.send({ success: true, data });
        }
      );

      r.patch(
        '/contacts/mass-update',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const body = ContactMassUpdateSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await customerRecords.massUpdate(engineContextFromJwt(request.id, jwt), {
            entityType: 'contact',
            ids: body.ids,
            data: body.data,
          });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/contacts/mass-delete',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.DELETE) },
        async (request, reply) => {
          const body = MassIdsSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await customerRecords.massArchive(engineContextFromJwt(request.id, jwt), {
            entityType: 'contact',
            ids: body.ids,
          });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/contacts/:id',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const access = await buildReadAccessContext(jwt, 'contact', request.headers.authorization);
          const contact = await contacts.getContactById(jwt.tenantId, id, access);
          return reply.send({ success: true, data: contact });
        }
      );

      r.patch(
        '/contacts/:id',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateContactSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          // Maker-checker: if a review process gates any edited field, divert the
          // whole change into a PendingChange and return 202 instead of writing.
          const review = await interceptForReview(prisma, {
            tenantId: jwt.tenantId,
            module: 'contact',
            recordId: id,
            changes: parsed.data as Record<string, unknown>,
            submittedById: jwt.sub,
          });
          if (review) {
            return reply.code(202).send({ success: true, pendingChangeId: review.pendingChangeId, requiresReview: true });
          }
          const contact = await customerRecords.update(engineContextFromJwt(request.id, jwt), {
            entityType: 'contact',
            id,
            data: parsed.data as Record<string, unknown>,
          });
          return reply.send({ success: true, data: contact });
        }
      );

      r.post(
        '/contacts/merge',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const parsed = MergeContactsSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const contact = await contacts.mergeContacts(
            jwt.tenantId,
            parsed.data.primaryId,
            parsed.data.secondaryId,
            parsed.data.fieldChoices ?? {},
            jwt.sub
          );
          return reply.send({ success: true, data: contact });
        }
      );

      r.delete(
        '/contacts/:id',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await customerRecords.archive(engineContextFromJwt(request.id, jwt), { entityType: 'contact', id });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/contacts/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const contact = await customerRecords.restore(engineContextFromJwt(request.id, jwt), { entityType: 'contact', id });
          return reply.send({ success: true, data: contact });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
