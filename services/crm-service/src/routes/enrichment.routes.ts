import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';
import { enrichAccount, enrichContact } from '../lib/enrichment.engine.js';

const CreateCompetitorSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
});

const UpdateCompetitorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  winRateAgainst: z.number().optional(),
});

export async function registerEnrichmentRoutes(app: FastifyInstance, prisma: CrmPrisma, producer?: NexusProducer): Promise<void> {
  if (!process.env.CLEARBIT_API_KEY && !process.env.APOLLO_API_KEY) {
    app.log.warn(
      'CLEARBIT_API_KEY/APOLLO_API_KEY not set; enrichment requests will be accepted and marked as skipped'
    );
  }

  app.post(
    '/api/v1/enrich/contact/:id',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { id } = req.params as { id: string };
      void enrichContact(prisma, jwt.tenantId, id, producer).catch(() => null);
      return reply.status(202).send({ success: true, data: { message: 'Enrichment queued', contactId: id } });
    }
  );

  app.post(
    '/api/v1/enrich/account/:id',
    { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { id } = req.params as { id: string };
      void enrichAccount(prisma, jwt.tenantId, id, producer).catch(() => null);
      return reply.status(202).send({ success: true, data: { message: 'Enrichment queued', accountId: id } });
    }
  );

  app.get(
    '/api/v1/enrich/status/:entityType/:entityId',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { entityType, entityId } = req.params as { entityType: string; entityId: string };
      const job = await prisma.enrichmentJob.findFirst({
        where: { tenantId: jwt.tenantId, entityType: entityType.toUpperCase(), entityId },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ success: true, data: job ?? { status: 'NONE' } });
    }
  );

  app.get(
    '/api/v1/competitors',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const competitors = await prisma.competitor.findMany({
        where: { tenantId: jwt.tenantId },
        orderBy: { name: 'asc' },
      });
      return reply.send({ success: true, data: competitors });
    }
  );

  app.post(
    '/api/v1/competitors',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const parsed = CreateCompetitorSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid body', parsed.error.flatten());
      }
      const created = await prisma.competitor.create({ data: { tenantId: jwt.tenantId, ...parsed.data } });
      return reply.status(201).send({ success: true, data: created });
    }
  );

  app.patch(
    '/api/v1/competitors/:id',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { id } = req.params as { id: string };
      const parsed = UpdateCompetitorSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid body', parsed.error.flatten());
      }
      await prisma.competitor.updateMany({ where: { id, tenantId: jwt.tenantId, deletedAt: null }, data: parsed.data });
      return reply.send({ success: true, data: { updated: true } });
    }
  );

  app.delete(
    '/api/v1/competitors/:id',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { id } = req.params as { id: string };
      await prisma.competitor.updateMany({ where: { id, tenantId: jwt.tenantId }, data: { deletedAt: new Date() } });
      return reply.send({ success: true, data: { id, deleted: true } });
    }
  );

  app.post(
    '/api/v1/competitors/:id/restore',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { id } = req.params as { id: string };
      const result = await prisma.competitor.updateMany({
        where: { id, tenantId: jwt.tenantId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (result.count === 0) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Competitor not found', requestId: req.id } });
      return reply.send({ success: true, data: { id, restored: true } });
    }
  );

  app.get(
    '/api/v1/deals/:dealId/competitors',
    { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { dealId } = req.params as { dealId: string };
      const data = await prisma.dealCompetitor.findMany({
        where: { tenantId: jwt.tenantId, dealId },
        include: { competitor: true },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/deals/:dealId/competitors',
    { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { dealId } = req.params as { dealId: string };
      const body = req.body as { competitorId: string; outcome?: string; notes?: string };
      const created = await prisma.dealCompetitor.create({
        data: { tenantId: jwt.tenantId, dealId, ...body },
        include: { competitor: true },
      });
      return reply.status(201).send({ success: true, data: created });
    }
  );

  app.delete(
    '/api/v1/deals/:dealId/competitors/:competitorId',
    { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { dealId, competitorId } = req.params as { dealId: string; competitorId: string };
      await prisma.dealCompetitor.updateMany({
        where: { tenantId: jwt.tenantId, dealId, competitorId },
        data: { deletedAt: new Date() },
      });
      return reply.send({ success: true, data: { dealId, competitorId, deleted: true } });
    }
  );

  app.get(
    '/api/v1/analytics/competitors',
    { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;

      const dealComps = await prisma.dealCompetitor.findMany({
        where: { tenantId: jwt.tenantId },
        include: { competitor: { select: { id: true, name: true } } },
      });

      const agg = new Map<string, { name: string; won: number; lost: number; total: number }>();
      for (const item of dealComps) {
        const key = item.competitorId;
        if (!agg.has(key)) agg.set(key, { name: item.competitor.name, won: 0, lost: 0, total: 0 });
        const entry = agg.get(key);
        if (!entry) continue;
        entry.total += 1;
        if (item.outcome === 'WON_AGAINST') entry.won += 1;
        if (item.outcome === 'LOST_TO') entry.lost += 1;
      }

      const data = Array.from(agg.values())
        .map((c) => ({
          ...c,
          winRate: c.total > 0 ? Math.round((c.won / c.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total);
      return reply.send({ success: true, data });
    }
  );
}
