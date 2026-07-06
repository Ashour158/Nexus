import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CrmPrisma } from '../prisma.js';

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

function tenantIdFromRequest(req: FastifyRequest): string | null {
  const raw = req.headers['x-tenant-id'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** Service-to-service reporting APIs (Prompt 29): no end-user JWT. */
export async function registerInternalReportingRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      /** Deal rows for funnel, snapshots, — filter by tenant + dates. */
      r.get('/internal/reporting/deals', async (req, reply) => {
        if (!verifyServiceToken(req)) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        const tenantId = tenantIdFromRequest(req);
        if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'MISSING_X_TENANT_ID', message: 'Missing X-Tenant-Id header', requestId: req.id } });

        const q = req.query as Record<string, string | undefined>;
        const limit = Math.min(Number(q.limit) || 2000, 5000);
        const from = q.from ? new Date(q.from) : undefined;
        const to = q.to ? new Date(q.to) : undefined;
        const pipelineId = q.pipelineId;

        const deals = await prisma.deal.findMany({
          where: {
            tenantId,
            ...(from || to
              ? {
                  createdAt: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                  },
                }
              : {}),
            ...(pipelineId && pipelineId !== 'all' ? { pipelineId } : {}),
          },
          include: { stage: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });

        const data = deals.map((d) => ({
          id: d.id,
          name: d.name,
          ownerId: d.ownerId,
          accountId: d.accountId,
          pipelineId: d.pipelineId,
          stageId: d.stageId,
          stage: d.stage.name,
          currency: d.currency,
          value: Number(d.amount),
          amount: Number(d.amount),
          probability: d.probability,
          expectedCloseDate: d.expectedCloseDate?.toISOString(),
          actualCloseDate: d.actualCloseDate?.toISOString(),
          source: d.source,
          lostReason: d.lostReason,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
          status: d.status,
          wonAt: d.status === 'WON' && d.actualCloseDate ? d.actualCloseDate.toISOString() : undefined,
          lostAt: d.status === 'LOST' ? d.actualCloseDate?.toISOString() : undefined,
        }));

        return reply.send({ success: true, data });
      });

      /** Cohort-style aggregates (rep / industry / rough size bucket). */
      r.get('/internal/reporting/deals/cohort', async (req, reply) => {
        if (!verifyServiceToken(req)) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        const tenantId = tenantIdFromRequest(req);
        if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'MISSING_X_TENANT_ID', message: 'Missing X-Tenant-Id header', requestId: req.id } });

        const q = req.query as Record<string, string | undefined>;
        const groupBy = q.groupBy === 'industry' ? 'industry' : 'ownerId';
        const from = q.from ? new Date(q.from) : undefined;
        const to = q.to ? new Date(q.to) : undefined;

        const deals = await prisma.deal.findMany({
          where: {
            tenantId,
            ...(from || to
              ? {
                  createdAt: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                  },
                }
              : {}),
          },
          include: {
            account: { select: { industry: true, annualRevenue: true } },
          },
        });

        type Row = {
          group: string;
          count: number;
          totalAmount: number;
          avgCycleDays: number | null;
        };
        const map = new Map<string, { count: number; totalAmount: number; cycleSum: number; cycleN: number }>();

        function keyForDeal(d: (typeof deals)[0]): string {
          if (groupBy === 'industry') return d.account?.industry ?? 'Unknown';
          return d.ownerId;
        }

        for (const d of deals) {
          const k = keyForDeal(d);
          const agg = map.get(k) ?? { count: 0, totalAmount: 0, cycleSum: 0, cycleN: 0 };
          agg.count += 1;
          agg.totalAmount += Number(d.amount);
          const close = d.actualCloseDate ?? d.updatedAt;
          const days = (close.getTime() - d.createdAt.getTime()) / 86400000;
          if (Number.isFinite(days) && days >= 0 && days < 730) {
            agg.cycleSum += days;
            agg.cycleN += 1;
          }
          map.set(k, agg);
        }

        const data: Row[] = Array.from(map.entries()).map(([group, agg]) => ({
          group,
          count: agg.count,
          totalAmount: Math.round(agg.totalAmount * 100) / 100,
          avgCycleDays:
            agg.cycleN > 0 ? Math.round((agg.cycleSum / agg.cycleN) * 10) / 10 : null,
        }));

        return reply.send({ success: true, data: { groupBy, rows: data } });
      });
    },
    { prefix: '/api/v1' }
  );
}
