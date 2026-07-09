import { Decimal } from 'decimal.js';
import type { IncentivePrisma } from '../prisma.js';

export function createContestsService(prisma: IncentivePrisma) {
  return {
    async listContests(tenantId: string) {
      return prisma.contest.findMany({
        where: { tenantId, isActive: true },
        include: { _count: { select: { entries: true } } },
        orderBy: { endDate: 'asc' },
      });
    },
    async createContest(tenantId: string, input: { name: string; description?: string; metric: 'DEALS_WON_COUNT' | 'DEALS_WON_REVENUE' | 'ACTIVITIES_COMPLETED' | 'LEADS_CONVERTED' | 'NEW_LOGOS'; targetValue?: string | number; startDate: string; endDate: string; prizeDescription?: string }) {
      return prisma.contest.create({
        data: {
          tenantId,
          name: input.name,
          description: input.description ?? null,
          metric: input.metric,
          targetValue: input.targetValue === undefined ? null : new Decimal(input.targetValue).toFixed(2),
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          prizeDescription: input.prizeDescription ?? null,
        },
      });
    },
    async getLeaderboard(tenantId: string, contestId: string) {
      return prisma.contestEntry.findMany({
        where: { tenantId, contestId },
        orderBy: [{ rank: 'asc' }, { currentValue: 'desc' }],
      });
    },
    /**
     * Event-driven update: for every active, in-window contest in this tenant
     * whose `metric` matches, upsert the owner's entry and add `delta` to its
     * currentValue, then recompute ranks within each affected contest.
     *
     * Tenant-scoped and idempotent-friendly at the row level (increment is
     * atomic). Returns the number of contest entries touched.
     */
    async applyEvent(
      tenantId: string,
      metric: 'DEALS_WON_COUNT' | 'DEALS_WON_REVENUE' | 'ACTIVITIES_COMPLETED' | 'LEADS_CONVERTED' | 'NEW_LOGOS',
      ownerId: string,
      delta: number,
    ): Promise<number> {
      if (!ownerId || !(delta > 0)) return 0;
      const now = new Date();
      const contests = await prisma.contest.findMany({
        take: 500,
        where: { tenantId, metric, isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      });
      for (const contest of contests) {
        await prisma.contestEntry.upsert({
          where: { contestId_ownerId: { contestId: contest.id, ownerId } },
          update: { currentValue: { increment: new Decimal(delta).toFixed(2) } },
          create: { contestId: contest.id, tenantId, ownerId, currentValue: new Decimal(delta).toFixed(2) },
        });
        await this.updateLeaderboard(tenantId, contest.id);
      }
      return contests.length;
    },
    async updateLeaderboard(tenantId: string, contestId: string) {
      const contest = await prisma.contest.findFirst({ where: { tenantId, id: contestId } });
      if (!contest) return null;
      const rows = await prisma.contestEntry.findMany({
    take: 500, where: { tenantId, contestId }, orderBy: { currentValue: 'desc' } });
      let rank = 1;
      for (const row of rows) {
        await prisma.contestEntry.update({ where: { id: row.id }, data: { rank } });
        rank += 1;
      }
      return this.getLeaderboard(tenantId, contestId);
    },
    startContestWorker() {
      const timer = setInterval(() => {
        void prisma.contest.findMany({
    take: 500, where: { isActive: true, endDate: { gte: new Date() } } }).then((contests) =>
          Promise.all(contests.map((contest) => this.updateLeaderboard(contest.tenantId, contest.id)))
        );
      }, 30 * 60 * 1000);
      return () => clearInterval(timer);
    },
  };
}
