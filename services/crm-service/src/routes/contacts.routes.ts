import type { FastifyInstance } from 'fastify';
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
  UpdateContactSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createContactsService } from '../services/contacts.service.js';

/**
 * Registers the `/api/v1/contacts/*` route family — Section 34.2 → "Contacts".
 */
export async function registerContactsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
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
