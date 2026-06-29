import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  ContactListQuerySchema,
  CreateContactSchema,
  IdParamSchema,
  UpdateContactSchema,
} from '@nexus/validation';
import { z } from 'zod';
import type { ContactsPrisma } from '../prisma.js';
import { createContactsService } from '../services/contacts.service.js';
import type { NexusProducer } from '@nexus/kafka';

const ArchiveSchema = z.object({ reason: z.string().optional() });
const DocumentSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  storageKey: z.string().min(1),
  checksum: z.string().optional(),
  retentionCategory: z.string().optional(),
});
const MailThreadSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  subject: z.string().min(1),
  fromEmail: z.string().email().optional(),
  toEmails: z.array(z.string().email()).optional(),
  messageCount: z.number().int().positive().optional(),
  lastMessageAt: z.coerce.date().optional(),
  snippet: z.string().optional(),
  isRead: z.boolean().optional(),
});
const MergeSchema = z.object({
  masterContactId: z.string().min(1),
  duplicateContactId: z.string().min(1),
});
const DuplicateSchema = z.object({
  id: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  accountId: z.string().optional(),
});
const BulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.enum(['archive', 'restore', 'update']).optional(),
  reason: z.string().optional(),
  ownerId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

function actorId(requestUser: unknown) {
  const jwt = requestUser as JwtPayload;
  return jwt.sub;
}

export async function registerContactsRoutes(
  app: FastifyInstance,
  prisma: ContactsPrisma,
  producer: NexusProducer
): Promise<void> {
  const contacts = createContactsService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/contacts',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const parsed = ContactListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await contacts.listContacts(
            jwt.tenantId,
            { accountId: q.accountId, ownerId: q.ownerId, search: q.search, isActive: q.isActive },
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
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const contact = await contacts.createContact(
            jwt.tenantId,
            parsed.data,
            actorId(request.user),
            request.headers['idempotency-key']?.toString()
          );
          return reply.code(201).send({ success: true, data: contact });
        }
      );

      r.post(
        '/contacts/duplicates',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const parsed = DuplicateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const duplicates = await contacts.findDuplicates(jwt.tenantId, parsed.data);
          return reply.send({ success: true, data: { duplicates } });
        }
      );

      r.post(
        '/contacts/duplicates/scan',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const groups = await contacts.scanDuplicates(jwt.tenantId);
          return reply.send({ success: true, data: { groups } });
        }
      );

      r.post(
        '/contacts/merge',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const parsed = MergeSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const contact = await contacts.mergeContacts(
            jwt.tenantId,
            parsed.data.masterContactId,
            parsed.data.duplicateContactId,
            actorId(request.user)
          );
          return reply.send({ success: true, data: contact });
        }
      );

      r.post(
        '/contacts/bulk',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const parsed = BulkSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const result = await contacts.bulkUpdate(jwt.tenantId, parsed.data.ids, parsed.data, actorId(request.user));
          return reply.send({ success: true, data: result });
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
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const contact = await contacts.updateContact(jwt.tenantId, id, parsed.data, actorId(request.user));
          return reply.send({ success: true, data: contact });
        }
      );

      r.delete(
        '/contacts/:id',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await contacts.deleteContact(jwt.tenantId, id, actorId(request.user));
          return reply.send({ success: true, data: { id, archived: true } });
        }
      );

      r.post(
        '/contacts/:id/archive',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = ArchiveSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const contact = await contacts.archiveContact(jwt.tenantId, id, actorId(request.user), parsed.data.reason ?? 'Archived by user');
          return reply.send({ success: true, data: contact });
        }
      );

      r.post(
        '/contacts/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const contact = await contacts.restoreContact(jwt.tenantId, id, actorId(request.user));
          return reply.send({ success: true, data: contact });
        }
      );

      r.get(
        '/contacts/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const documents = await contacts.listDocuments(jwt.tenantId, id);
          return reply.send({ success: true, data: documents });
        }
      );

      r.post(
        '/contacts/:id/documents',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = DocumentSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const document = await contacts.attachDocument(jwt.tenantId, id, parsed.data, actorId(request.user));
          return reply.code(201).send({ success: true, data: document });
        }
      );

      r.get(
        '/contacts/:id/mail',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const threads = await contacts.listMailThreads(jwt.tenantId, id);
          return reply.send({ success: true, data: threads });
        }
      );

      r.post(
        '/contacts/:id/mail',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = MailThreadSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const thread = await contacts.upsertMailThread(jwt.tenantId, id, parsed.data, actorId(request.user));
          return reply.send({ success: true, data: thread });
        }
      );

      r.get(
        '/contacts/:id/timeline',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const events = await contacts.listTimeline(jwt.tenantId, id);
          return reply.send({ success: true, data: { events, nextCursor: null } });
        }
      );

      r.get(
        '/contacts/:id/field-history',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await contacts.listFieldHistory(jwt.tenantId, id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/contacts/:id/audit',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await contacts.listAuditEvents(jwt.tenantId, id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/contacts/:id/outbox',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const rows = await contacts.listOutboxEvents(id);
          return reply.send({ success: true, data: rows });
        }
      );
    },
    { prefix: process.env.CONTACTS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
