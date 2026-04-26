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
  ContactListQuerySchema,
  CreateContactSchema,
  IdParamSchema,
  PaginationSchema,
  UpdateContactSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createContactsService } from '../services/contacts.service.js';
import { createAttachmentsService } from '../services/attachments.service.js';

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

async function uploadToStorage(payload: {
  fileName: string;
  mimeType: string;
  contentBase64?: string;
}): Promise<string> {
  if (!payload.contentBase64) return `manual/${Date.now()}-${payload.fileName}`;
  const base = process.env.STORAGE_SERVICE_URL ?? 'http://localhost:3008';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const res = await fetch(`${base}/api/v1/objects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Storage upload failed');
  const body = (await res.json()) as { data?: { storageKey?: string } };
  return body.data?.storageKey ?? `fallback/${Date.now()}-${payload.fileName}`;
}

/**
 * Registers the `/api/v1/contacts/*` route family — Section 34.2 → "Contacts".
 */
export async function registerContactsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const contacts = createContactsService(prisma, producer);
  const attachments = createAttachmentsService(prisma);

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
          const result = await contacts.listContacts(
            jwt.tenantId,
            {
              accountId: q.accountId,
              ownerId: q.ownerId,
              search: q.search,
              isActive: q.isActive,
            },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/contacts',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateContactSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const contact = await contacts.createContact(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: contact });
        }
      );

      r.get(
        '/contacts/:id/email-threads',
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
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'contact', id);
          return reply.send({ success: true, data });
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
          if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
          return reply.send({ success: true, data });
        }
      );

      r.patch(
        '/contacts/mass-update',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const body = ContactMassUpdateSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await prisma.contact.updateMany({
            where: { tenantId: jwt.tenantId, id: { in: body.ids } },
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
          const data = await prisma.contact.deleteMany({
            where: { tenantId: jwt.tenantId, id: { in: body.ids } },
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
          const contact = await contacts.getContactById(jwt.tenantId, id);
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
          const contact = await contacts.updateContact(
            jwt.tenantId,
            id,
            parsed.data
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
          await contacts.deleteContact(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
