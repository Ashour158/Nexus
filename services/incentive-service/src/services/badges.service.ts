import type { Prisma } from '../../../../node_modules/.prisma/incentive-client/index.js';
import type { IncentivePrisma } from '../prisma.js';

const SYSTEM_BADGES = [
  ['first_deal', 'Won first deal', 'Closed the first deal', '🏆', { metric: 'DEALS_WON_COUNT', operator: 'gte', value: 1 }],
  ['deal_10', 'Won 10 deals total', 'Closed ten deals', '⭐', { metric: 'DEALS_WON_COUNT', operator: 'gte', value: 10 }],
  ['big_deal', 'Big Deal', 'Won a deal over $100k', '💰', { metric: 'DEALS_WON_REVENUE', operator: 'gte', value: 100000 }],
  ['speed_demon', 'Speed Demon', 'Closed a deal in under 7 days', '⚡', { metric: 'DEAL_CYCLE_DAYS', operator: 'lte', value: 7 }],
  ['activity_streak', 'Activity Streak', 'Logged activities 5 days in a row', '🔥', { metric: 'ACTIVITY_STREAK', operator: 'gte', value: 5 }],
  ['top_prospector', 'Top Prospector', 'Created 20 leads in a month', '🎯', { metric: 'LEADS_CREATED', operator: 'gte', value: 20 }],
  ['converter', 'Converter', 'Converted 10 leads', '🔄', { metric: 'LEADS_CONVERTED', operator: 'gte', value: 10 }],
  ['quota_crusher', 'Quota Crusher', 'Reached 150% of quota', '🚀', { metric: 'QUOTA_ATTAINMENT', operator: 'gte', value: 150 }],
] as const;

function passes(condition: { operator?: unknown; value?: unknown }, value: number): boolean {
  const target = Number(condition.value ?? 0);
  return condition.operator === 'lte' ? value <= target : value >= target;
}

export function createBadgesService(prisma: IncentivePrisma) {
  return {
    async seedSystemBadges() {
      for (const [key, name, description, icon, condition] of SYSTEM_BADGES) {
        await prisma.badge.upsert({
          where: { key },
          update: {},
          create: { key, name, description, icon, condition: condition as Prisma.InputJsonValue },
        });
      }
    },
    async listBadges(tenantId: string) {
      await this.seedSystemBadges();
      return prisma.badge.findMany({
        where: { OR: [{ tenantId: null }, { tenantId }] },
        include: { awardedTo: { where: { tenantId } } },
        orderBy: { name: 'asc' },
      });
    },
    async getMyBadges(tenantId: string, ownerId: string) {
      await this.seedSystemBadges();
      return prisma.badge.findMany({
        where: { OR: [{ tenantId: null }, { tenantId }] },
        include: { awardedTo: { where: { tenantId, ownerId } } },
        orderBy: { name: 'asc' },
      });
    },
    async checkAndAward(tenantId: string, ownerId: string, metric: string, value: number) {
      await this.seedSystemBadges();
      const badges = await prisma.badge.findMany({ where: { OR: [{ tenantId: null }, { tenantId }] } });
      const awarded = [];
      for (const badge of badges) {
        const condition = badge.condition as { metric?: string; operator?: string; value?: number };
        if (condition.metric !== metric || !passes(condition, value)) continue;
        const award = await prisma.badgeAward.upsert({
          where: { badgeId_tenantId_ownerId: { badgeId: badge.id, tenantId, ownerId } },
          update: {},
          create: { badgeId: badge.id, tenantId, ownerId },
        });
        awarded.push(award);
      }
      return awarded;
    },
  };
}
