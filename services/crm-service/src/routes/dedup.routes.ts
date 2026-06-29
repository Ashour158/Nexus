import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';
import type { createDedupService } from '../services/dedup.service.js';

type DedupService = ReturnType<typeof createDedupService>;

export async function registerDedupRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  dedupService: DedupService
): Promise<void> {
  await app.register(async (r) => {
    r.post('/dedup/scan', async (req, reply) => {
      const { tenantId, roles } = (req as any).user as { tenantId: string; roles: string[] };
      const roleSet = new Set((roles ?? []).map((x) => x.toLowerCase()));
      if (!roleSet.has('admin') && !roleSet.has('manager')) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      }
      dedupService.runFullScan(tenantId).catch((err) => app.log.error({ err }, 'Dedup scan failed'));
      return reply.send({ success: true, message: 'Duplicate scan started. Results will be available within 2 minutes.' });
    });

    r.get('/dedup/groups', async (req, reply) => {
      const { tenantId, roles } = (req as any).user as { tenantId: string; roles: string[] };
      const roleSet = new Set((roles ?? []).map((x) => x.toLowerCase()));
      if (!roleSet.has('admin') && !roleSet.has('manager')) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      }
      const { entityType, status = 'pending', limit = '20', offset = '0' } = req.query as {
        entityType?: string;
        status?: string;
        limit?: string;
        offset?: string;
      };
      const where: Record<string, unknown> = { tenantId, status };
      if (entityType) where.entityType = entityType;

      const p = prisma as any;
      const [total, groups] = await Promise.all([
        p.duplicateGroup.count({ where }),
        p.duplicateGroup.findMany({
          where,
          include: { records: true },
          orderBy: { createdAt: 'desc' },
          take: Number(limit),
          skip: Number(offset),
        }),
      ]);

      const enriched = await Promise.all(groups.map(async (group: any) => {
        const recordData = await Promise.all(group.records.map(async (rec: any) => {
          let data: Record<string, unknown> | null = null;
          if (group.entityType === 'contact') {
            data = await p.contact.findUnique({
              where: { id: rec.recordId },
              select: {
                id: true, firstName: true, lastName: true, email: true,
                phone: true, jobTitle: true, accountId: true, ownerId: true,
                customFields: true, tags: true, createdAt: true,
              },
            });
          } else if (group.entityType === 'account') {
            data = await p.account.findUnique({
              where: { id: rec.recordId },
              select: {
                id: true, name: true, email: true, phone: true,
                website: true, industry: true, country: true, city: true,
                customFields: true, tags: true, createdAt: true,
              },
            });
          }
          return { ...rec, data };
        }));
        return { ...group, records: recordData };
      }));

      return reply.send({ success: true, data: { total, groups: enriched } });
    });

    const MergeBodySchema = z.object({
      masterId: z.string().cuid(),
      fieldSelections: z.record(
        z.object({
          sourceId: z.string().cuid(),
          value: z.unknown(),
        })
      ),
    }).strict();

    r.post('/dedup/groups/:id/merge', async (req, reply) => {
      const { tenantId, sub: userId, roles } = (req as any).user as { tenantId: string; sub: string; roles: string[] };
      const roleSet = new Set((roles ?? []).map((x) => x.toLowerCase()));
      if (!roleSet.has('admin') && !roleSet.has('manager')) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      }
      const { id } = req.params as { id: string };
      const { masterId, fieldSelections } = MergeBodySchema.parse(req.body);
      const result = await dedupService.mergeContacts(tenantId, id, masterId, fieldSelections, userId);
      return reply.send({ success: true, data: result });
    });

    r.post('/dedup/groups/:id/dismiss', async (req, reply) => {
      const { sub: userId, roles } = (req as any).user as { sub: string; roles: string[] };
      const roleSet = new Set((roles ?? []).map((x) => x.toLowerCase()));
      if (!roleSet.has('admin') && !roleSet.has('manager')) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      }
      const { id } = req.params as { id: string };
      await (prisma as any).duplicateGroup.update({
        where: { id },
        data: { status: 'dismissed', resolvedAt: new Date(), resolvedBy: userId },
      });
      return reply.send({ success: true });
    });

    r.get('/dedup/stats', async (req, reply) => {
      const { tenantId } = (req as any).user as { tenantId: string };
      const p = prisma as any;
      const [pendingContacts, pendingAccounts, mergedTotal] = await Promise.all([
        p.duplicateGroup.count({ where: { tenantId, entityType: 'contact', status: 'pending' } }),
        p.duplicateGroup.count({ where: { tenantId, entityType: 'account', status: 'pending' } }),
        p.duplicateGroup.count({ where: { tenantId, status: 'merged' } }),
      ]);
      return reply.send({ success: true, data: { pendingContacts, pendingAccounts, mergedTotal } });
    });
  }, { prefix: '/api/v1' });
}
