import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async quotaPlans(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.quotaPlan.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.planLoader.prime(item.id, item);
      return items.map(mapPlan);
    },
    async quotaPlan(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.planLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapPlan(item) : null;
    },
    async quotaTargets(_parent: unknown, { planId }: { planId: string }, ctx: GraphQLContext) {
      const items = await ctx.prisma.quotaTarget.findMany({ where: { planId } });
      for (const item of items) ctx.loaders.targetLoader.prime(item.id, item);
      return items.map(mapTarget);
    },
    async quotaTarget(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.targetLoader.load(id);
      return item ? mapTarget(item) : null;
    },
    async forecastSubmissions(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.forecastSubmission.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.submissionLoader.prime(item.id, item);
      return items.map(mapSubmission);
    },
    async forecastSubmission(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.submissionLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapSubmission(item) : null;
    },
    async forecastReviews(_parent: unknown, { submissionId }: { submissionId: string }, ctx: GraphQLContext) {
      const items = await ctx.prisma.forecastReview.findMany({ where: { submissionId } });
      for (const item of items) ctx.loaders.reviewLoader.prime(item.id, item);
      return items.map(mapReview);
    },
    async forecastOverrides(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.forecastOverride.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.overrideLoader.prime(item.id, item);
      return items.map(mapOverride);
    },
    async forecastOverride(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.overrideLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapOverride(item) : null;
    },
  },
  Mutation: {
    async createQuotaPlan(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.quotaPlan.create({ data: input });
      ctx.loaders.planLoader.prime(item.id, item);
      return mapPlan(item);
    },
    async updateQuotaPlan(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.quotaPlan.update({ where: { id }, data: input });
      ctx.loaders.planLoader.clear(id).prime(id, item);
      return mapPlan(item);
    },
    async deleteQuotaPlan(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.quotaPlan.delete({ where: { id } });
      ctx.loaders.planLoader.clear(id);
      return true;
    },
    async createQuotaTarget(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.quotaTarget.create({ data: input });
      ctx.loaders.targetLoader.prime(item.id, item);
      return mapTarget(item);
    },
    async updateQuotaTarget(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.quotaTarget.update({ where: { id }, data: input });
      ctx.loaders.targetLoader.clear(id).prime(id, item);
      return mapTarget(item);
    },
    async deleteQuotaTarget(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.quotaTarget.delete({ where: { id } });
      ctx.loaders.targetLoader.clear(id);
      return true;
    },
    async createForecastSubmission(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.forecastSubmission.create({ data: input });
      ctx.loaders.submissionLoader.prime(item.id, item);
      return mapSubmission(item);
    },
    async updateForecastSubmission(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.forecastSubmission.update({ where: { id }, data: input });
      ctx.loaders.submissionLoader.clear(id).prime(id, item);
      return mapSubmission(item);
    },
    async deleteForecastSubmission(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.forecastSubmission.delete({ where: { id } });
      ctx.loaders.submissionLoader.clear(id);
      return true;
    },
    async createForecastReview(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.forecastReview.create({ data: input });
      ctx.loaders.reviewLoader.prime(item.id, item);
      return mapReview(item);
    },
    async createForecastOverride(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.forecastOverride.create({ data: input });
      ctx.loaders.overrideLoader.prime(item.id, item);
      return mapOverride(item);
    },
    async updateForecastOverride(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.forecastOverride.update({ where: { id }, data: input });
      ctx.loaders.overrideLoader.clear(id).prime(id, item);
      return mapOverride(item);
    },
    async deleteForecastOverride(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.forecastOverride.delete({ where: { id } });
      ctx.loaders.overrideLoader.clear(id);
      return true;
    },
  },
  QuotaPlan: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.planLoader.load(reference.id);
      return item ? mapPlan(item) : null;
    },
    async targets(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.quotaTarget.findMany({ where: { planId: parent.id } });
      return items.map(mapTarget);
    },
  },
  QuotaTarget: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.targetLoader.load(reference.id);
      return item ? mapTarget(item) : null;
    },
    async plan(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.planLoader.load(parent.planId);
      return item ? mapPlan(item) : null;
    },
  },
  ForecastSubmission: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.submissionLoader.load(reference.id);
      return item ? mapSubmission(item) : null;
    },
    async reviews(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.forecastReview.findMany({ where: { submissionId: parent.id } });
      return items.map(mapReview);
    },
  },
  ForecastReview: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.reviewLoader.load(reference.id);
      return item ? mapReview(item) : null;
    },
    async submission(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.submissionLoader.load(parent.submissionId);
      return item ? mapSubmission(item) : null;
    },
  },
  ForecastOverride: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.overrideLoader.load(reference.id);
      return item ? mapOverride(item) : null;
    },
  },
};

function mapPlan(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapTarget(item: any) {
  return {
    ...item,
    targetValue: item.targetValue?.toString?.() ?? item.targetValue,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapSubmission(item: any) {
  return {
    ...item,
    commitAmount: item.commitAmount?.toString?.() ?? item.commitAmount,
    bestCaseAmount: item.bestCaseAmount?.toString?.() ?? item.bestCaseAmount,
    pipelineAmount: item.pipelineAmount?.toString?.() ?? item.pipelineAmount,
    submittedAt: item.submittedAt?.toISOString?.() ?? item.submittedAt,
  };
}

function mapReview(item: any) {
  return {
    ...item,
    adjustedCommit: item.adjustedCommit?.toString?.() ?? item.adjustedCommit,
    adjustedBest: item.adjustedBest?.toString?.() ?? item.adjustedBest,
    reviewedAt: item.reviewedAt?.toISOString?.() ?? item.reviewedAt,
  };
}

function mapOverride(item: any) {
  return {
    ...item,
    originalValue: item.originalValue?.toString?.() ?? item.originalValue,
    overrideValue: item.overrideValue?.toString?.() ?? item.overrideValue,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}
