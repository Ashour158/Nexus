import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import { PERMISSIONS, requirePermission, checkPermission } from '@nexus/service-utils';
import { DomainError, type EngineContext } from '@nexus/domain-core';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';
import { createAccountsService } from '../services/accounts.service.js';
import { createContactsService } from '../services/contacts.service.js';
import { createDealsService } from '../services/deals.service.js';
import { createLeadsService } from '../services/leads.service.js';
import { createBulkRecordsUseCase } from '../use-cases/bulk-records.use-case.js';

const ENTITY_PERMISSIONS: Record<string, { update: string; delete: string }> = {
  contact: { update: PERMISSIONS.CONTACTS.UPDATE, delete: PERMISSIONS.CONTACTS.DELETE },
  deal: { update: PERMISSIONS.DEALS.UPDATE, delete: PERMISSIONS.DEALS.DELETE },
  lead: { update: PERMISSIONS.LEADS.UPDATE, delete: PERMISSIONS.LEADS.DELETE },
  account: { update: PERMISSIONS.ACCOUNTS.UPDATE, delete: PERMISSIONS.ACCOUNTS.DELETE },
};

const EntityTypeSchema = z.enum(['contact', 'deal', 'lead', 'account']);

const BulkUpdateSchema = z.object({
  entityType: EntityTypeSchema,
  ids: z.array(z.string().min(1)).min(1).max(1000),
  updates: z.record(z.unknown()).refine((v) => Object.keys(v).length > 0, { message: 'updates must not be empty' }),
});

const BulkDeleteSchema = z.object({
  entityType: EntityTypeSchema,
  ids: z.array(z.string().min(1)).min(1).max(500),
  hard: z.boolean().optional().default(false),
});

const BulkTagSchema = z.object({
  entityType: EntityTypeSchema,
  ids: z.array(z.string().min(1)).min(1).max(500),
  addTags: z.array(z.string().min(1)).optional().default([]),
  removeTags: z.array(z.string().min(1)).optional().default([]),
});

const BulkReassignSchema = z.object({
  entityType: z.enum(['contact', 'deal', 'lead', 'account', 'all']),
  ids: z.array(z.string().min(1)).max(1000).optional(),
  toUserId: z.string().min(1),
  fromUserId: z.string().min(1).optional(),
});

export async function registerBulkRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const accounts = createAccountsService(prisma, producer);
  const contacts = createContactsService(prisma, producer);
  const deals = createDealsService(prisma, producer);
  const leads = createLeadsService(prisma, producer);

  const bulkUseCase = createBulkRecordsUseCase({
    services: {
      contact: {
        update: (tenantId, id, updates, userId) => contacts.updateContact(tenantId, id, updates as any, userId),
        archive: (tenantId, id, deletedBy, deletedByName) => contacts.deleteContact(tenantId, id, deletedBy, deletedByName),
      },
      deal: {
        update: (tenantId, id, updates, userId) => deals.updateDeal(tenantId, id, updates as any, userId ? { userId } : undefined),
        archive: (tenantId, id, deletedBy, deletedByName) => deals.deleteDeal(tenantId, id, deletedBy, deletedByName),
      },
      lead: {
        update: (tenantId, id, updates, userId) => leads.updateLead(tenantId, id, updates as any, userId),
        archive: (tenantId, id, deletedBy, deletedByName) => leads.deleteLead(tenantId, id, deletedBy, deletedByName),
      },
      account: {
        update: (tenantId, id, updates, userId) => accounts.updateAccount(tenantId, id, updates as any, userId),
        archive: (tenantId, id, deletedBy, deletedByName) => accounts.deleteAccount(tenantId, id, deletedBy, deletedByName),
      },
    },
    prisma,
    producer,
  });

  function engineContextFromJwt(req: { id: string }, jwt: { tenantId: string; sub: string; email?: string; roles?: string[]; permissions?: string[] }): EngineContext {
    return {
      audit: {
        actor: {
          userId: jwt.sub,
          tenantId: jwt.tenantId,
          email: jwt.email,
          roles: jwt.roles ?? [],
          permissions: jwt.permissions ?? [],
        },
        requestId: req.id,
        correlationId: req.id,
        source: 'api',
      },
      now: new Date(),
    };
  }

  function sendDomainError(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown, requestId: string) {
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({ success: false, error: { code: error.code, message: error.message, requestId } });
    }
    throw error;
  }

  await app.register(async (r) => {
    r.addHook('preHandler', async (req, reply) => {
      if (!(req as any).user) return reply.code(401).send({ success: false, error: 'Unauthorized' });
    });

    r.post('/bulk/update', { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) }, async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string; sub: string; permissions: string[] };
      const parse = BulkUpdateSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, updates } = parse.data;

      const requiredPerm = ENTITY_PERMISSIONS[entityType]?.update;
      if (requiredPerm && !checkPermission(jwt.permissions ?? [], requiredPerm)) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: `Permission required: ${requiredPerm}`, requestId: req.id } });
      }

      try {
        const result = await bulkUseCase.bulkUpdate(engineContextFromJwt(req, jwt), { entityType, ids, updates });
        return reply.send({ success: true, data: result });
      } catch (error) {
        return sendDomainError(reply, error, req.id);
      }
    });

    r.post('/bulk/delete', { preHandler: requirePermission(PERMISSIONS.DEALS.DELETE) }, async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string; sub: string; roles: string[]; permissions: string[] };
      const parse = BulkDeleteSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, hard } = parse.data;
      const requiredPerm = ENTITY_PERMISSIONS[entityType]?.delete;
      if (requiredPerm && !checkPermission(jwt.permissions ?? [], requiredPerm)) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: `Permission required: ${requiredPerm}`, requestId: req.id } });
      }
      try {
        const result = await bulkUseCase.bulkDelete(engineContextFromJwt(req, jwt), { entityType, ids, hard });
        return reply.send({ success: true, data: result });
      } catch (error) {
        return sendDomainError(reply, error, req.id);
      }
    });

    r.post('/bulk/tag', { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) }, async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string; sub: string; permissions: string[] };
      const parse = BulkTagSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, addTags, removeTags } = parse.data;

      const requiredPerm = ENTITY_PERMISSIONS[entityType]?.update;
      if (requiredPerm && !checkPermission(jwt.permissions ?? [], requiredPerm)) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: `Permission required: ${requiredPerm}`, requestId: req.id } });
      }

      try {
        const result = await bulkUseCase.bulkTag(engineContextFromJwt(req, jwt), { entityType, ids, addTags, removeTags });
        return reply.send({ success: true, data: result });
      } catch (error) {
        return sendDomainError(reply, error, req.id);
      }
    });

    r.post('/bulk/reassign', { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) }, async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string; roles: string[]; sub: string; permissions: string[] };
      const parse = BulkReassignSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, toUserId, fromUserId } = parse.data;

      const entities = entityType === 'all' ? ['contact', 'deal', 'lead', 'account'] : [entityType];
      for (const entity of entities) {
        const requiredPerm = ENTITY_PERMISSIONS[entity]?.update;
        if (requiredPerm && !checkPermission(jwt.permissions ?? [], requiredPerm)) {
          return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: `Permission required for ${entity}: ${requiredPerm}`, requestId: req.id } });
        }
      }

      try {
        const results = await bulkUseCase.bulkReassign(engineContextFromJwt(req, jwt), { entityType, ids, toUserId, fromUserId });
        return reply.send({ success: true, data: results });
      } catch (error) {
        return sendDomainError(reply, error, req.id);
      }
    });
  }, { prefix: '/api/v1' });
}
