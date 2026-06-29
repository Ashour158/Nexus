import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';

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
  await app.register(async (r) => {
    r.addHook('preHandler', async (req, reply) => {
      if (!(req as any).user) return reply.code(401).send({ success: false, error: 'Unauthorized' });
    });

    r.post('/bulk/update', { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) }, async (req, reply) => {
      const { tenantId, sub: userId } = (req as any).user as { tenantId: string; sub: string };
      const parse = BulkUpdateSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, updates } = parse.data;

      const allowedFields: Record<string, string[]> = {
        contact: ['ownerId', 'tags', 'isActive', 'doNotEmail', 'doNotCall', 'country', 'city', 'department'],
        deal: ['ownerId', 'stageId', 'pipelineId', 'status', 'forecastCategory', 'tags'],
        lead: ['ownerId', 'status', 'rating', 'tags', 'doNotContact'],
        account: ['ownerId', 'type', 'tier', 'status', 'tags', 'country', 'city'],
      };
      const safeUpdates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if ((allowedFields[entityType] ?? []).includes(k)) safeUpdates[k] = v;
      }
      if (!Object.keys(safeUpdates).length) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No valid update fields provided', requestId: req.id } });
      }

      let count = 0;
      const data = { ...safeUpdates, updatedAt: new Date() };
      const p = prisma as any;
      if (entityType === 'contact') count = (await p.contact.updateMany({ where: { id: { in: ids }, tenantId, deletedAt: null }, data })).count;
      else if (entityType === 'deal') count = (await p.deal.updateMany({ where: { id: { in: ids }, tenantId, deletedAt: null }, data })).count;
      else if (entityType === 'lead') count = (await p.lead.updateMany({ where: { id: { in: ids }, tenantId, deletedAt: null }, data })).count;
      else if (entityType === 'account') count = (await p.account.updateMany({ where: { id: { in: ids }, tenantId, deletedAt: null }, data })).count;

      await producer.publish(`${entityType}.bulk.updated`, {
        type: `${entityType}.bulk.updated`,
        tenantId,
        userId,
        entityType,
        ids,
        updates: safeUpdates,
        count,
      });
      return reply.send({ success: true, data: { updated: count } });
    });

    r.post('/bulk/delete', { preHandler: requirePermission(PERMISSIONS.DEALS.DELETE) }, async (req, reply) => {
      const { tenantId, sub: userId, roles } = (req as any).user as { tenantId: string; sub: string; roles: string[] };
      const role = roles?.[0]?.toLowerCase() ?? '';
      const parse = BulkDeleteSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, hard } = parse.data;
      if (hard && role !== 'admin') return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins can hard-delete records', requestId: req.id } });

      let count = 0;
      const p = prisma as any;
      if (hard) {
        if (entityType === 'contact') count = (await p.contact.deleteMany({ where: { id: { in: ids }, tenantId } })).count;
        else if (entityType === 'lead') count = (await p.lead.deleteMany({ where: { id: { in: ids }, tenantId } })).count;
        else if (entityType === 'account') count = (await p.account.deleteMany({ where: { id: { in: ids }, tenantId } })).count;
        else if (entityType === 'deal') count = (await p.deal.deleteMany({ where: { id: { in: ids }, tenantId } })).count;
      } else {
        const now = new Date();
        if (entityType === 'contact') count = (await p.contact.updateMany({ where: { id: { in: ids }, tenantId }, data: { deletedAt: now } })).count;
        else if (entityType === 'lead') count = (await p.lead.updateMany({ where: { id: { in: ids }, tenantId }, data: { deletedAt: now } })).count;
        else if (entityType === 'deal') count = (await p.deal.updateMany({ where: { id: { in: ids }, tenantId }, data: { deletedAt: now } })).count;
        else if (entityType === 'account') count = (await p.account.updateMany({ where: { id: { in: ids }, tenantId }, data: { deletedAt: now } })).count;
      }

      await producer.publish(`${entityType}.bulk.deleted`, {
        type: `${entityType}.bulk.deleted`,
        tenantId,
        userId,
        entityType,
        ids,
        hard,
        count,
      });
      return reply.send({ success: true, data: { deleted: count } });
    });

    r.post('/bulk/tag', { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) }, async (req, reply) => {
      const { tenantId } = (req as any).user as { tenantId: string };
      const parse = BulkTagSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, addTags, removeTags } = parse.data;

      const p = prisma as any;
      // Batch fetch all records in one query to avoid N+1
      let records: { id: string; tags: string[] }[] = [];
      if (entityType === 'contact') {
        records = await p.contact.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, tags: true } });
      } else if (entityType === 'lead') {
        records = await p.lead.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, tags: true } });
      } else if (entityType === 'deal') {
        records = await p.deal.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, tags: true } });
      } else if (entityType === 'account') {
        records = await p.account.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, tags: true } });
      }

      const updates = records.map((r) => {
        const newTags = [...new Set([...r.tags.filter((t: string) => !removeTags.includes(t)), ...addTags])];
        return { id: r.id, tags: newTags };
      });

      // Process updates in larger chunks with bounded concurrency to reduce connection churn
      const chunkSize = 100;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await Promise.all(chunk.map((u) => {
          if (entityType === 'contact') return p.contact.updateMany({ where: { id: u.id, deletedAt: null }, data: { tags: u.tags } });
          if (entityType === 'lead') return p.lead.updateMany({ where: { id: u.id, deletedAt: null }, data: { tags: u.tags } });
          if (entityType === 'deal') return p.deal.updateMany({ where: { id: u.id, deletedAt: null }, data: { tags: u.tags } });
          return p.account.updateMany({ where: { id: u.id, deletedAt: null }, data: { tags: u.tags } });
        }));
      }

      return reply.send({ success: true, data: { processed: updates.length } });
    });

    r.post('/bulk/reassign', { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) }, async (req, reply) => {
      const { tenantId, roles, sub: userId } = (req as any).user as { tenantId: string; roles: string[]; sub: string };
      const roleSet = new Set((roles ?? []).map((r0) => r0.toLowerCase()));
      if (!roleSet.has('admin') && !roleSet.has('manager')) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins and managers can bulk reassign', requestId: req.id } });
      }

      const parse = BulkReassignSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message, requestId: req.id } });
      }
      const { entityType, ids, toUserId, fromUserId } = parse.data;

      const whereClause = ids?.length
        ? { id: { in: ids }, tenantId }
        : fromUserId
          ? { ownerId: fromUserId, tenantId }
          : null;

      if (!whereClause) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide either ids or fromUserId', requestId: req.id } });

      const reassignData = { ownerId: toUserId, updatedAt: new Date() };
      const results: Record<string, number> = {};
      const p = prisma as any;
      const entities = entityType === 'all' ? ['contact', 'deal', 'lead', 'account'] : [entityType];

      const reassignWhere = { ...whereClause, deletedAt: null };
      for (const entity of entities) {
        if (entity === 'contact') results.contacts = (await p.contact.updateMany({ where: reassignWhere, data: reassignData })).count;
        else if (entity === 'deal') results.deals = (await p.deal.updateMany({ where: reassignWhere, data: reassignData })).count;
        else if (entity === 'lead') results.leads = (await p.lead.updateMany({ where: reassignWhere, data: reassignData })).count;
        else if (entity === 'account') results.accounts = (await p.account.updateMany({ where: reassignWhere, data: reassignData })).count;
      }

      await producer.publish('records.bulk.reassigned', {
        type: 'records.bulk.reassigned',
        tenantId,
        userId,
        toUserId,
        fromUserId,
        entityType,
        results,
      });
      return reply.send({ success: true, data: results });
    });
  }, { prefix: '/api/v1' });
}
