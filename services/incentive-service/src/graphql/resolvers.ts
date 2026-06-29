import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async contests(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.contest.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.contestLoader.prime(item.id, item);
      return items.map(mapContest);
    },
    async contest(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.contestLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapContest(item) : null;
    },
    async contestEntries(_parent: unknown, { contestId }: { contestId: string }, ctx: GraphQLContext) {
      const items = await ctx.prisma.contestEntry.findMany({ where: { contestId } });
      for (const item of items) ctx.loaders.entryLoader.prime(item.id, item);
      return items.map(mapEntry);
    },
    async badges(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.badge.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.badgeLoader.prime(item.id, item);
      return items;
    },
    async badge(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.badgeLoader.load(id);
    },
    async badgeAwards(_parent: unknown, { badgeId }: { badgeId: string }, ctx: GraphQLContext) {
      const items = await ctx.prisma.badgeAward.findMany({ where: { badgeId } });
      for (const item of items) ctx.loaders.awardLoader.prime(item.id, item);
      return items.map(mapAward);
    },
  },
  Mutation: {
    async createContest(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.contest.create({ data: input });
      ctx.loaders.contestLoader.prime(item.id, item);
      return mapContest(item);
    },
    async updateContest(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.contest.update({ where: { id }, data: input });
      ctx.loaders.contestLoader.clear(id).prime(id, item);
      return mapContest(item);
    },
    async deleteContest(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.contest.delete({ where: { id } });
      ctx.loaders.contestLoader.clear(id);
      return true;
    },
    async createContestEntry(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.contestEntry.create({ data: input });
      ctx.loaders.entryLoader.prime(item.id, item);
      return mapEntry(item);
    },
    async updateContestEntry(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.contestEntry.update({ where: { id }, data: input });
      ctx.loaders.entryLoader.clear(id).prime(id, item);
      return mapEntry(item);
    },
    async deleteContestEntry(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.contestEntry.delete({ where: { id } });
      ctx.loaders.entryLoader.clear(id);
      return true;
    },
    async createBadge(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.badge.create({ data: input });
      ctx.loaders.badgeLoader.prime(item.id, item);
      return item;
    },
    async updateBadge(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.badge.update({ where: { id }, data: input });
      ctx.loaders.badgeLoader.clear(id).prime(id, item);
      return item;
    },
    async deleteBadge(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.badge.delete({ where: { id } });
      ctx.loaders.badgeLoader.clear(id);
      return true;
    },
    async createBadgeAward(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.badgeAward.create({ data: input });
      ctx.loaders.awardLoader.prime(item.id, item);
      return mapAward(item);
    },
    async deleteBadgeAward(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.badgeAward.delete({ where: { id } });
      ctx.loaders.awardLoader.clear(id);
      return true;
    },
  },
  Contest: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.contestLoader.load(reference.id);
      return item ? mapContest(item) : null;
    },
    async entries(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.contestEntry.findMany({ where: { contestId: parent.id } });
      return items.map(mapEntry);
    },
  },
  ContestEntry: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.entryLoader.load(reference.id);
      return item ? mapEntry(item) : null;
    },
    async contest(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.contestLoader.load(parent.contestId);
      return item ? mapContest(item) : null;
    },
  },
  Badge: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.badgeLoader.load(reference.id);
    },
    async awardedTo(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.badgeAward.findMany({ where: { badgeId: parent.id } });
      return items.map(mapAward);
    },
  },
  BadgeAward: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.awardLoader.load(reference.id);
      return item ? mapAward(item) : null;
    },
    async badge(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.loaders.badgeLoader.load(parent.badgeId);
    },
  },
};

function mapContest(item: any) {
  return {
    ...item,
    targetValue: item.targetValue?.toString?.() ?? item.targetValue,
    startDate: item.startDate?.toISOString?.() ?? item.startDate,
    endDate: item.endDate?.toISOString?.() ?? item.endDate,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}

function mapEntry(item: any) {
  return {
    ...item,
    currentValue: item.currentValue?.toString?.() ?? item.currentValue,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapAward(item: any) {
  return {
    ...item,
    awardedAt: item.awardedAt?.toISOString?.() ?? item.awardedAt,
  };
}
