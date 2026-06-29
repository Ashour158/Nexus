import type { FastifyInstance } from 'fastify';
import type { CrmPrisma } from '../prisma.js';

function getPeriodDates(period: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === 'this_month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3);
    start.setMonth(q * 3, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(q * 3 + 3, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'next_quarter') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    start.setMonth(q * 3, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(q * 3 + 3, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

/** Accepts shorthand like `this_quarter` or quarter keys `Q2-2026`. */
export function resolveForecastWindow(periodKey: string): { start: Date; end: Date } {
  const trimmed = periodKey.trim();
  const qr = /^Q([1-4])-(\d{4})$/.exec(trimmed);
  if (qr) {
    const qi = parseInt(qr[1], 10) - 1;
    const year = parseInt(qr[2], 10);
    const start = new Date(Date.UTC(year, qi * 3, 1));
    const end = new Date(Date.UTC(year, qi * 3 + 3, 0, 23, 59, 59, 999));
    return { start, end };
  }
  return getPeriodDates(trimmed);
}

export async function registerForecastRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(async (r) => {
    r.get('/forecast/rep-summary', async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string };
      const tenantId = jwt.tenantId;
      if (!tenantId)
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { periodKey = 'this_quarter' } = req.query as { periodKey?: string };
      const { start, end } = resolveForecastWindow(periodKey);

      const deals = await prisma.deal.findMany({
        where: {
          tenantId,
          status: { not: 'LOST' },
          expectedCloseDate: { gte: start, lte: end },
        },
        include: { stage: true },
      });

      const byOwner = new Map<string, typeof deals>();
      for (const deal of deals) {
        const list = byOwner.get(deal.ownerId) ?? [];
        list.push(deal);
        byOwner.set(deal.ownerId, list);
      }

      const ownerIds = [...byOwner.keys()];
      const profiles = ownerIds.length
        ? await prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
      const profileMap = new Map(profiles.map((u) => [u.id, u]));

      const rows = ownerIds.map((ownerId) => {
        const list = byOwner.get(ownerId) ?? [];
        let totalValue = 0;
        let weightedValue = 0;
        for (const deal of list) {
          const prob = deal.stage?.probability ?? deal.probability ?? 0;
          const amt = Number(deal.amount);
          totalValue += amt;
          weightedValue += (amt * prob) / 100;
        }
        const profile = profileMap.get(ownerId);
        const ownerName =
          profile && `${profile.firstName}${profile.lastName}`.trim()
            ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
            : ownerId.slice(0, 8);
        return {
          ownerId,
          ownerName,
          totalValue,
          weightedValue: Math.round(weightedValue),
        };
      });

      rows.sort((a, b) => a.ownerName.localeCompare(b.ownerName));

      return reply.send({ success: true, data: rows });
    });

    r.get('/forecast', async (req, reply) => {
      const jwt = (req as any).user as { tenantId: string };
      const tenantId = jwt.tenantId;
      if (!tenantId) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant is required', requestId: req.id } });
      const { period = 'this_quarter' } = req.query as { period?: string };
      const { start, end } = getPeriodDates(period);

      const deals = await prisma.deal.findMany({
        where: {
          tenantId,
          status: { not: 'LOST' },
          expectedCloseDate: { gte: start, lte: end },
        },
        include: { stage: true },
      });

      const stageMap = new Map<string, { stageName: string; probability: number; deals: typeof deals }>();
      for (const deal of deals) {
        const stageId = deal.stageId || 'unknown';
        const stageName = deal.stage?.name || 'Unknown';
        const probability = deal.stage?.probability || deal.probability || 50;
        if (!stageMap.has(stageId)) {
          stageMap.set(stageId, { stageName, probability, deals: [] });
        }
        stageMap.get(stageId)?.deals.push(deal);
      }

      const stages = Array.from(stageMap.entries())
        .map(([stageId, { stageName, probability, deals: stageDeals }]) => {
          const totalAmount = stageDeals.reduce((s, d) => s + Number(d.amount || 0), 0);
          const weightedAmount = Math.round(totalAmount * (probability / 100));
          return {
            stageId,
            stageName,
            probability,
            dealCount: stageDeals.length,
            totalAmount,
            weightedAmount,
          };
        })
        .sort((a, b) => a.probability - b.probability);

      const closedDeals = await prisma.deal.findMany({
        where: { tenantId, status: 'WON', actualCloseDate: { gte: start, lte: end } },
        select: { amount: true },
      });

      const pipeline = stages.reduce((s, st) => s + st.totalAmount, 0);
      const weighted = stages.reduce((s, st) => s + st.weightedAmount, 0);
      const committed = stages
        .filter((st) => st.probability >= 80)
        .reduce((s, st) => s + st.totalAmount, 0);
      const closed = closedDeals.reduce((s, d) => s + Number(d.amount || 0), 0);

      return reply.send({ success: true, data: { pipeline, weighted, committed, closed, stages } });
    });
  }, { prefix: '/api/v1' });
}
