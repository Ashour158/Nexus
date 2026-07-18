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

      // Batch-load every referenced record per entityType in ONE findMany each
      // (previously a findUnique per record per group — an N+1). Build id→record
      // maps and stitch the enriched view together in memory.
      const contactIds: string[] = [];
      const accountIds: string[] = [];
      const dealIds: string[] = [];
      for (const group of groups) {
        for (const rec of group.records) {
          if (group.entityType === 'contact') contactIds.push(rec.recordId);
          else if (group.entityType === 'account') accountIds.push(rec.recordId);
          else if (group.entityType === 'deal') dealIds.push(rec.recordId);
        }
      }

      const [contacts, accounts, deals] = await Promise.all([
        contactIds.length
          ? p.contact.findMany({
              where: { id: { in: contactIds } },
              select: {
                id: true, firstName: true, lastName: true, email: true,
                phone: true, jobTitle: true, accountId: true, ownerId: true,
                customFields: true, tags: true, createdAt: true,
              },
            })
          : [],
        accountIds.length
          ? p.account.findMany({
              where: { id: { in: accountIds } },
              select: {
                id: true, name: true, email: true, phone: true,
                website: true, industry: true, country: true, city: true,
                customFields: true, tags: true, createdAt: true,
              },
            })
          : [],
        dealIds.length
          ? p.deal.findMany({
              where: { id: { in: dealIds } },
              select: {
                id: true, name: true, amount: true, currency: true,
                accountId: true, ownerId: true, pipelineId: true, stageId: true,
                status: true, expectedCloseDate: true, createdAt: true,
              },
            })
          : [],
      ]);

      const contactMap = new Map(contacts.map((c: { id: string }) => [c.id, c]));
      const accountMap = new Map(accounts.map((a: { id: string }) => [a.id, a]));
      const dealMap = new Map(deals.map((d: { id: string }) => [d.id, d]));

      const enriched = groups.map((group: any) => ({
        ...group,
        records: group.records.map((rec: any) => ({
          ...rec,
          data:
            group.entityType === 'contact'
              ? contactMap.get(rec.recordId) ?? null
              : group.entityType === 'account'
                ? accountMap.get(rec.recordId) ?? null
                : group.entityType === 'deal'
                  ? dealMap.get(rec.recordId) ?? null
                  : null,
        })),
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
      // Branch on the group's entityType so account groups use the account merge path.
      const group = await (prisma as any).duplicateGroup.findUnique({
        where: { id },
        select: { entityType: true, tenantId: true },
      });
      if (!group || group.tenantId !== tenantId) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Group not found', requestId: req.id } });
      }
      const result =
        group.entityType === 'account'
          ? await dedupService.mergeAccounts(tenantId, id, masterId, fieldSelections, userId)
          : group.entityType === 'deal'
            ? await dedupService.mergeDealsByGroup(tenantId, id, masterId, fieldSelections, userId)
            : await dedupService.mergeContacts(tenantId, id, masterId, fieldSelections, userId);
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
      const [pendingContacts, pendingAccounts, pendingDeals, mergedTotal] = await Promise.all([
        p.duplicateGroup.count({ where: { tenantId, entityType: 'contact', status: 'pending' } }),
        p.duplicateGroup.count({ where: { tenantId, entityType: 'account', status: 'pending' } }),
        p.duplicateGroup.count({ where: { tenantId, entityType: 'deal', status: 'pending' } }),
        p.duplicateGroup.count({ where: { tenantId, status: 'merged' } }),
      ]);
      return reply.send({ success: true, data: { pendingContacts, pendingAccounts, pendingDeals, mergedTotal } });
    });
  }, { prefix: '/api/v1' });
}
