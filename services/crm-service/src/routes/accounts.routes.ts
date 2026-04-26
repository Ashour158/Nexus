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
  AccountListQuerySchema,
  CreateAccountSchema,
  IdParamSchema,
  PaginationSchema,
  UpdateAccountSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createAccountsService } from '../services/accounts.service.js';
import { createAttachmentsService } from '../services/attachments.service.js';

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
 * Registers the `/api/v1/accounts/*` route family — Section 34.2 → "Accounts".
 */
export async function registerAccountsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const accounts = createAccountsService(prisma, producer);
  const attachments = createAttachmentsService(prisma);

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
          const result = await accounts.listAccounts(
            jwt.tenantId,
            {
              ownerId: q.ownerId,
              type: q.type,
              tier: q.tier,
              status: q.status,
              industry: q.industry,
              search: q.search,
            },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
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
          const account = await accounts.createAccount(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: account });
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
            limit: q.limit,
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
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'account', id);
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
          if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
          return reply.send({ success: true, data });
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
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const account = await accounts.updateAccount(
            jwt.tenantId,
            id,
            parsed.data
          );
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
    },
    { prefix: '/api/v1' }
  );
}
