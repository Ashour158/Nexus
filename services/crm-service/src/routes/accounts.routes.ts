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
  AccountListQuerySchema,
  CreateAccountSchema,
  IdParamSchema,
  PaginationSchema,
  UpdateAccountSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createAccountsService } from '../services/accounts.service.js';
import { createAttachmentsService } from '../services/attachments.service.js';
import { uploadToStorage } from '../lib/storage.js';
import { getFieldHistory } from '../lib/field-history.js';
import { createCustomerRecordsUseCase } from '../use-cases/customer-records.use-case.js';
import { buildReadAccessContext } from '../lib/access-context.js';
import { withIdempotency } from '../lib/idempotency.js';
import type { EngineContext } from '@nexus/domain-core';

const dataServiceProxyClient = createHttpClient({
  baseURL: process.env.DATA_SERVICE_URL ?? 'http://localhost:3015',
});

const DealsForAccountQuerySchema = PaginationSchema.extend({
  status: z.enum(['OPEN', 'WON', 'LOST', 'DORMANT']).optional(),
  pipelineId: z.string().cuid().optional(),
});

const ContactsForAccountQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
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
const MassIdsSchema = z.object({ ids: z.array(z.string().cuid()).min(1).max(200) });
const AccountMassUpdateSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
  data: z.record(z.unknown()),
});

/**
 * Registers the `/api/v1/accounts/*` route family — Section 34.2 → "Accounts".
 */
export async function registerAccountsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const accounts = createAccountsService(prisma, producer);
  const attachments = createAttachmentsService(prisma);
  const customerRecords = createCustomerRecordsUseCase({
    services: {
      contact: {
        create: async () => undefined,
        get: async () => ({}),
        update: async () => undefined,
        archive: async () => undefined,
        restore: async () => undefined,
      },
      account: {
        create: (tenantId, data) => accounts.createAccount(tenantId, data as never),
        get: (tenantId, id) => accounts.getAccountById(tenantId, id) as Promise<Record<string, unknown>>,
        update: (tenantId, id, updates, userId, userName, roles) => accounts.updateAccount(tenantId, id, updates as never, userId, userName, roles),
        archive: (tenantId, id) => accounts.deleteAccount(tenantId, id),
        restore: (tenantId, id) => accounts.restoreAccount(tenantId, id),
      },
    },
    repositories: {
      contact: prisma.contact as never,
      account: prisma.account as never,
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
        '/accounts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = AccountListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const access = await buildReadAccessContext(jwt, 'account', request.headers.authorization);
          const result = await accounts.listAccounts(jwt.tenantId, {
            ownerId: q.ownerId,
            type: q.type,
            tier: q.tier,
            status: q.status,
            industry: q.industry,
            search: q.search,
          }, {
            page: q.page,
            limit: q.limit,
            sortBy: q.sortBy,
            sortDir: q.sortDir,
          }, access);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/accounts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateAccountSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const { statusCode, body } = await withIdempotency(prisma, request, jwt.tenantId, async () => {
            const account = await customerRecords.create(engineContextFromJwt(request.id, jwt), {
              entityType: 'account',
              data: parsed.data as Record<string, unknown>,
            });
            return { statusCode: 201, body: { success: true, data: account } };
          });
          return reply.code(statusCode).send(body);
        }
      );

      r.get(
        '/accounts/:id/email-threads',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await prisma.emailThread.findMany({
            where: { tenantId: jwt.tenantId, accountId: id },
            include: { messages: { orderBy: { sentAt: 'desc' } } },
            orderBy: { lastMessageAt: 'desc' },
          });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/accounts/:id/health',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const insight = await accounts.getAccountHealth(jwt.tenantId, id);
          return reply.send({ success: true, data: insight });
        }
      );

      r.get(
        '/accounts/:id/timeline',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await accounts.getAccountTimeline(jwt.tenantId, id, {
            page: q.page,
            limit: Math.min(100, q.limit),
          });
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/accounts/:id/contacts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = ContactsForAccountQuerySchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await accounts.listAccountContacts(jwt.tenantId, id, {
            page: q.page,
            limit: q.limit,
            search: q.search,
          });
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/accounts/:id/deals',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = DealsForAccountQuerySchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await accounts.listAccountDeals(jwt.tenantId, id, {
            page: q.page,
            limit: q.limit,
            status: q.status,
            pipelineId: q.pipelineId,
          });
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/accounts/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'account', id, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/accounts/:id/field-history',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await accounts.getAccountById(jwt.tenantId, id);
          const data = await getFieldHistory(prisma, jwt.tenantId, 'account', id);
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/accounts/:id/audit',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await accounts.getAccountById(jwt.tenantId, id);
          const [fieldChanges, attachmentsRows] = await Promise.all([
            getFieldHistory(prisma, jwt.tenantId, 'account', id),
            prisma.attachment.findMany({
              where: { tenantId: jwt.tenantId, module: 'account', recordId: id },
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
        '/accounts/:id/outbox',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await accounts.getAccountById(jwt.tenantId, id);
          const data = await prisma.outboxMessage.findMany({
            where: {
              OR: [
                { aggregateId: id },
                { payload: { path: ['tenantId'], equals: jwt.tenantId } },
                { payload: { path: ['payload', 'accountId'], equals: id } },
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

      r.get(
        '/accounts/:id/duplicates',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await customerRecords.checkAccountDuplicates(engineContextFromJwt(request.id, jwt), { accountId: id });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/accounts/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
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
            'account',
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

      r.delete(
        '/accounts/:id/attachments/:attachmentId',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const p = AttachmentIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await attachments.deleteAttachment(jwt.tenantId, p.attachmentId);
          if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attachment not found', requestId: request.id } });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const access = await buildReadAccessContext(jwt, 'account', request.headers.authorization);
          const account = await accounts.getAccountById(jwt.tenantId, id, access);
          return reply.send({ success: true, data: account });
        }
      );

      r.patch(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateAccountSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const account = await customerRecords.update(engineContextFromJwt(request.id, jwt), {
            entityType: 'account',
            id,
            data: parsed.data as Record<string, unknown>,
          });
          return reply.send({ success: true, data: account });
        }
      );

      r.delete(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await customerRecords.archive(engineContextFromJwt(request.id, jwt), { entityType: 'account', id });
          return reply.send({ success: true, data });
        }
      );

      r.patch(
        '/accounts/mass-update',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const body = AccountMassUpdateSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await customerRecords.massUpdate(engineContextFromJwt(request.id, jwt), {
            entityType: 'account',
            ids: body.ids,
            data: body.data,
          });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/accounts/mass-delete',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.DELETE) },
        async (request, reply) => {
          const body = MassIdsSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await customerRecords.massArchive(engineContextFromJwt(request.id, jwt), {
            entityType: 'account',
            ids: body.ids,
          });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/accounts/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const account = await customerRecords.restore(engineContextFromJwt(request.id, jwt), { entityType: 'account', id });
          return reply.send({ success: true, data: account });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
