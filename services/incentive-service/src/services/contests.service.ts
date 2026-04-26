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
    async updateLeaderboard(tenantId: string, contestId: string) {
      const contest = await prisma.contest.findFirst({ where: { tenantId, id: contestId } });
      if (!contest) return null;
      const rows = await prisma.contestEntry.findMany({ where: { tenantId, contestId }, orderBy: { currentValue: 'desc' } });
      let rank = 1;
      for (const row of rows) {
        await prisma.contestEntry.update({ where: { id: row.id }, data: { rank } });
        rank += 1;
      }
      return this.getLeaderboard(tenantId, contestId);
    },
    startContestWorker() {
      const timer = setInterval(() => {
        void prisma.contest.findMany({ where: { isActive: true, endDate: { gte: new Date() } } }).then((contests) =>
          Promise.all(contests.map((contest) => this.updateLeaderboard(contest.tenantId, contest.id)))
        );
      }, 30 * 60 * 1000);
      return () => clearInterval(timer);
    },
  };
}
