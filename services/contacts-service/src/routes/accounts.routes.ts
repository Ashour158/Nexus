import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  AccountListQuerySchema,
  CreateAccountSchema,
  IdParamSchema,
  UpdateAccountSchema,
} from '@nexus/validation';
import type { ContactsPrisma } from '../prisma.js';
import { createAccountsService } from '../services/accounts.service.js';
import type { NexusProducer } from '@nexus/kafka';

export async function registerAccountsRoutes(
  app: FastifyInstance,
  prisma: ContactsPrisma,
  producer: NexusProducer
): Promise<void> {
  const accounts = createAccountsService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/accounts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = AccountListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await accounts.listAccounts(jwt.tenantId, { ownerId: q.ownerId, type: q.type, tier: q.tier, status: q.status, industry: q.industry, search: q.search }, { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir });
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/accounts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateAccountSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const account = await accounts.createAccount(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: account });
        }
      );

      r.get(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const account = await accounts.getAccountById(jwt.tenantId, id);
          return reply.send({ success: true, data: account });
        }
      );

      r.patch(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateAccountSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const account = await accounts.updateAccount(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: account });
        }
      );

      r.delete(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await accounts.deleteAccount(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      r.get(
        '/accounts/:id/contacts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const q = request.query as Record<string, string>;
          const page = Math.max(1, Number(q.page ?? 1));
          const limit = Math.min(100, Number(q.limit ?? 20));
          const result = await accounts.listAccountContacts(jwt.tenantId, id, { page, limit, search: q.search });
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: process.env.CONTACTS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
