import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';
import {
  recalculateAccountHealth,
} from '../lib/lead-scoring.engine.js';
import { DeterministicScoringEngine } from '../lib/deterministic-scoring.engine.js';

function resolveTenantId(req: { user?: unknown }): string | undefined {
  const user = (req as any).user as JwtPayload | undefined;
  return user?.tenantId;
}

export async function registerScoringRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(async (r) => {
    // Legacy scoring routes (keeping for backward compatibility)
    r.get('/lead-scores', { preHandler: requirePermission(PERMISSIONS.LEADS.READ) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { tier, limit = '50', offset = '0' } = req.query as Record<string, string>;
      const where: Record<string, unknown> = { tenantId };
      if (tier) where.tier = tier;
      const take = Number.parseInt(limit, 10) || 50;
      const skip = Number.parseInt(offset, 10) || 0;
      const [data, total] = await Promise.all([
        prisma.leadScore.findMany({
          where,
          include: {
            lead: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                company: true,
                status: true,
              },
            },
          },
          orderBy: { score: 'desc' },
          take,
          skip,
        }),
        prisma.leadScore.count({ where }),
      ]);
      return reply.send({ success: true, data: { rows: data, total } });
    });

    r.get('/lead-scores/:leadId', { preHandler: requirePermission(PERMISSIONS.LEADS.READ) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { leadId } = req.params as { leadId: string };
      const score = await prisma.leadScore.findFirst({ where: { tenantId, leadId } });
      if (!score) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Score not found', requestId: req.id } });
      return reply.send({ success: true, data: score });
    });

    r.post('/lead-scores/:leadId/recalculate', { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { leadId } = req.params as { leadId: string };

      // Use deterministic scoring
      const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
      await scoringEngine.recalculateScoreRealTime(leadId);

      const updated = await prisma.leadScore.findFirst({ where: { tenantId, leadId } });
      return reply.send({ success: true, data: updated });
    });

    // New deterministic scoring routes
    r.get('/scoring/lead-scores/:leadId', { preHandler: requirePermission(PERMISSIONS.LEADS.READ) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { leadId } = req.params as { leadId: string };

      const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
      const result = await scoringEngine.calculateScore(leadId);

      return reply.send({ success: true, data: result });
    });

    r.post('/scoring/lead-scores/:leadId/recalculate', { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { leadId } = req.params as { leadId: string };

      const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
      await scoringEngine.recalculateScoreRealTime(leadId);

      const result = await scoringEngine.calculateScore(leadId);
      return reply.send({ success: true, data: result });
    });

    r.get('/scoring/lead-scores/:leadId/insights', { preHandler: requirePermission(PERMISSIONS.LEADS.READ) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { leadId } = req.params as { leadId: string };

      const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
      const insights = await scoringEngine.getScoringInsights(leadId);

      return reply.send({ success: true, data: insights });
    });

    r.post('/scoring/batch-recalculate', { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { leadIds } = req.body as { leadIds: string[] };

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'leadIds array is required', requestId: req.id } });
      }

      const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
      await scoringEngine.batchRecalculateScores(leadIds);

      return reply.send({ success: true, data: { message: `Recalculated scores for ${leadIds.length} leads` } });
    });

    // Automated routing routes
    r.get('/routing/decisions', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { priority, limit = '50', offset = '0' } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { tenantId };
      if (priority) where.priority = priority;

      const take = Number.parseInt(limit, 10) || 50;
      const skip = Number.parseInt(offset, 10) || 0;

      const [data, total] = await Promise.all([
        prisma.leadRoutingEvent.findMany({
          where,
          include: {
            lead: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                company: true,
              },
            },
            territory: {
              select: { id: true, name: true },
            },
            salesRep: {
              select: { id: true, user: { select: { firstName: true, lastName: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        prisma.leadRoutingEvent.count({ where }),
      ]);

      return reply.send({ success: true, data: { rows: data, total } });
    });

    r.get('/routing/territories', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });

      const territories = await prisma.territory.findMany({
        where: { tenantId, isActive: true },
        include: {
          salesReps: {
            where: { isActive: true },
            include: { user: true },
            select: {
              id: true,
              capacity: true,
              user: { select: { firstName: true, lastName: true } }
            }
          },
          _count: {
            select: { leads: true }
          }
        }
      });

      return reply.send({ success: true, data: territories });
    });

    r.post('/routing/manual/:leadId', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { leadId } = req.params as { leadId: string };
      const { territoryId, salesRepId, reason } = req.body as {
        territoryId: string;
        salesRepId: string;
        reason?: string;
      };

      // Validate territory and sales rep exist
      const territory = await prisma.territory.findFirst({
        where: { id: territoryId, tenantId, isActive: true }
      });
      if (!territory) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Territory not found', requestId: req.id } });

      const salesRep = await prisma.salesRep.findFirst({
        where: { id: salesRepId, tenantId, isActive: true }
      });
      if (!salesRep) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Sales rep not found', requestId: req.id } });

      // Create manual routing event
      const routingEvent = await prisma.leadRoutingEvent.create({
        data: {
          tenantId,
          leadId,
          territoryId,
          salesRepId,
          priority: 'medium',
          reason: reason || 'Manual routing',
          confidence: 1.0,
          alternativeRoutes: [],
          createdAt: new Date(),
        }
      });

      // Update lead assignment
      await prisma.lead.update({
        where: { id: leadId, tenantId },
        data: {
          assignedTo: salesRepId,
          territoryId,
          priority: 'medium',
        }
      });

      return reply.send({ success: true, data: routingEvent });
    });

    // Account health routes (keeping existing)
    r.get('/account-health', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { riskLevel, limit = '50', offset = '0' } = req.query as Record<string, string>;
      const where: Record<string, unknown> = { tenantId };
      if (riskLevel) where.riskLevel = riskLevel;
      const take = Number.parseInt(limit, 10) || 50;
      const skip = Number.parseInt(offset, 10) || 0;
      const [data, total] = await Promise.all([
        prisma.accountHealthScore.findMany({
          where,
          include: {
            account: { select: { id: true, name: true, industry: true, tier: true } },
          },
          orderBy: { score: 'asc' },
          take,
          skip,
        }),
        prisma.accountHealthScore.count({ where }),
      ]);
      return reply.send({ success: true, data: { rows: data, total } });
    });

    r.get('/account-health/:accountId', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { accountId } = req.params as { accountId: string };
      const score = await prisma.accountHealthScore.findFirst({
        where: { tenantId, accountId },
      });
      if (!score) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Score not found', requestId: req.id } });
      return reply.send({ success: true, data: score });
    });

    r.post('/account-health/:accountId/recalculate', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { accountId } = req.params as { accountId: string };
      await recalculateAccountHealth(prisma, tenantId, accountId);
      const updated = await prisma.accountHealthScore.findFirst({
        where: { tenantId, accountId },
      });
      return reply.send({ success: true, data: updated });
    });

    // Scoring rules management (keeping existing)
    r.get('/scoring-rules', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const data = await prisma.leadScoringRule.findMany({
        where: { tenantId },
        orderBy: { signal: 'asc' },
      });
      return reply.send({ success: true, data });
    });

    r.post('/scoring-rules', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const body = req.body as {
        name: string;
        signal: string;
        points: number;
        condition?: Record<string, unknown>;
      };
      const rule = await prisma.leadScoringRule.create({
        data: {
          tenantId,
          name: body.name,
          signal: body.signal,
          points: Number(body.points),
          condition: body.condition ?? {},
        },
      });
      return reply.code(201).send({ success: true, data: rule });
    });

    r.patch('/scoring-rules/:id', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { id } = req.params as { id: string };
      const body = req.body as Partial<{
        name: string;
        points: number;
        condition: Record<string, unknown>;
        isActive: boolean;
      }>;
      const updated = await prisma.leadScoringRule.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: body,
      });
      return reply.send({ success: true, data: { updated: updated.count } });
    });

    r.delete('/scoring-rules/:id', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { id } = req.params as { id: string };
      await prisma.leadScoringRule.updateMany({ where: { id, tenantId }, data: { deletedAt: new Date() } });
      return reply.send({ success: true, data: { id, deleted: true } });
    });

    r.post('/scoring-rules/:id/restore', async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { id } = req.params as { id: string };
      const result = await prisma.leadScoringRule.updateMany({
        where: { id, tenantId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (result.count === 0) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Scoring rule not found', requestId: req.id } });
      return reply.send({ success: true, data: { id, restored: true } });
    });

    // Analytics routes (keeping existing)
    r.get('/analytics/leaderboard', { preHandler: requirePermission(PERMISSIONS.DEALS.READ) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { period = '30' } = req.query as { period?: string };
      const since = new Date();
      since.setDate(since.getDate() - (Number.parseInt(period, 10) || 30));

      const wonDeals = await prisma.deal.groupBy({
        by: ['ownerId'],
        where: {
          tenantId,
          status: 'WON',
          OR: [{ actualCloseDate: { gte: since } }, { updatedAt: { gte: since } }],
        },
        _count: { id: true },
        _sum: { amount: true },
      });

      const data = wonDeals
        .map((d) => ({
          repId: d.ownerId,
          repName: d.ownerId.slice(0, 8),
          wonDeals: d._count.id,
          totalRevenue: Number(d._sum.amount ?? 0),
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .map((rep, index) => ({ ...rep, rank: index + 1 }));

      return reply.send({ success: true, data: { rows: data, period: Number.parseInt(period, 10) || 30 } });
    });

    r.get('/analytics/win-loss', { preHandler: requirePermission(PERMISSIONS.DEALS.READ) }, async (req, reply) => {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { repId, period = '90' } = req.query as Record<string, string>;
      const since = new Date();
      since.setDate(since.getDate() - (Number.parseInt(period, 10) || 90));
      const where: Record<string, unknown> = {
        tenantId,
        status: { in: ['WON', 'LOST'] },
        OR: [{ actualCloseDate: { gte: since } }, { updatedAt: { gte: since } }],
      };
      if (repId) where.ownerId = repId;
      const deals = await prisma.deal.findMany({
        where,
        select: {
          id: true,
          status: true,
          amount: true,
          ownerId: true,
          actualCloseDate: true,
          updatedAt: true,
          lostReason: true,
        },
      });
      const won = deals.filter((d) => d.status === 'WON');
      const lost = deals.filter((d) => d.status === 'LOST');
      const winRate = deals.length > 0 ? Math.round((won.length / deals.length) * 100) : 0;
      const wonRevenue = won.reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const lostRevenue = lost.reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const lostReasons: Record<string, number> = {};
      for (const d of lost) {
        const reason = d.lostReason || 'Unknown';
        lostReasons[reason] = (lostReasons[reason] ?? 0) + 1;
      }

      const monthlyTrend: Array<{ month: string; won: number; lost: number; winRate: number }> = [];
      for (let i = 5; i >= 0; i -= 1) {
        const start = new Date();
        start.setMonth(start.getMonth() - i, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        const monthDeals = deals.filter((d) => {
          const closeDate = d.actualCloseDate ?? d.updatedAt;
          return closeDate >= start && closeDate < end;
        });
        const monthWon = monthDeals.filter((d) => d.status === 'WON');
        monthlyTrend.push({
          month: start.toLocaleString('default', { month: 'short', year: '2-digit' }),
          won: monthWon.length,
          lost: monthDeals.length - monthWon.length,
          winRate: monthDeals.length > 0 ? Math.round((monthWon.length / monthDeals.length) * 100) : 0,
        });
      }

      return reply.send({
        success: true,
        data: {
          summary: {
            totalDeals: deals.length,
            wonDeals: won.length,
            lostDeals: lost.length,
            winRate,
            wonRevenue,
            lostRevenue,
          },
          lostReasons: Object.entries(lostReasons)
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count),
          monthlyTrend,
        },
      });
    });
  }, { prefix: '/api/v1' });
}
