import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async playbooks(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.playbook.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.playbookLoader.prime(item.id, item);
      return items.map(mapPlaybook);
    },
    async playbook(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.playbookLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapPlaybook(item) : null;
    },
    async playbookStages(_parent: unknown, { playbookId }: { playbookId: string }, ctx: GraphQLContext) {
      const items = await ctx.prisma.playbookStage.findMany({ where: { playbookId } });
      for (const item of items) ctx.loaders.stageLoader.prime(item.id, item);
      return items;
    },
    async dealTemplates(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.dealTemplate.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.templateLoader.prime(item.id, item);
      return items.map(mapDealTemplate);
    },
    async dealTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.templateLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapDealTemplate(item) : null;
    },
    async stageTransitionRules(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.stageTransitionRule.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.ruleLoader.prime(item.id, item);
      return items.map(mapRule);
    },
    async stageTransitionRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.ruleLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapRule(item) : null;
    },
  },
  Mutation: {
    async createPlaybook(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.playbook.create({ data: input });
      ctx.loaders.playbookLoader.prime(item.id, item);
      return mapPlaybook(item);
    },
    async updatePlaybook(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.playbook.update({ where: { id }, data: input });
      ctx.loaders.playbookLoader.clear(id).prime(id, item);
      return mapPlaybook(item);
    },
    async deletePlaybook(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.playbook.delete({ where: { id } });
      ctx.loaders.playbookLoader.clear(id);
      return true;
    },
    async createPlaybookStage(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.playbookStage.create({ data: input });
      ctx.loaders.stageLoader.prime(item.id, item);
      return item;
    },
    async updatePlaybookStage(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.playbookStage.update({ where: { id }, data: input });
      ctx.loaders.stageLoader.clear(id).prime(id, item);
      return item;
    },
    async deletePlaybookStage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.playbookStage.delete({ where: { id } });
      ctx.loaders.stageLoader.clear(id);
      return true;
    },
    async createDealTemplate(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.dealTemplate.create({ data: input });
      ctx.loaders.templateLoader.prime(item.id, item);
      return mapDealTemplate(item);
    },
    async updateDealTemplate(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.dealTemplate.update({ where: { id }, data: input });
      ctx.loaders.templateLoader.clear(id).prime(id, item);
      return mapDealTemplate(item);
    },
    async deleteDealTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.dealTemplate.delete({ where: { id } });
      ctx.loaders.templateLoader.clear(id);
      return true;
    },
    async createStageTransitionRule(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.stageTransitionRule.create({ data: input });
      ctx.loaders.ruleLoader.prime(item.id, item);
      return mapRule(item);
    },
    async updateStageTransitionRule(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.stageTransitionRule.update({ where: { id }, data: input });
      ctx.loaders.ruleLoader.clear(id).prime(id, item);
      return mapRule(item);
    },
    async deleteStageTransitionRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.stageTransitionRule.delete({ where: { id } });
      ctx.loaders.ruleLoader.clear(id);
      return true;
    },
  },
  Playbook: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.playbookLoader.load(reference.id);
      return item ? mapPlaybook(item) : null;
    },
    async stages(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.playbookStage.findMany({ where: { playbookId: parent.id } });
    },
  },
  PlaybookStage: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.stageLoader.load(reference.id);
    },
    async playbook(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.playbookLoader.load(parent.playbookId);
      return item ? mapPlaybook(item) : null;
    },
  },
  DealTemplate: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.templateLoader.load(reference.id);
      return item ? mapDealTemplate(item) : null;
    },
  },
  StageTransitionRule: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.ruleLoader.load(reference.id);
      return item ? mapRule(item) : null;
    },
  },
};

function mapPlaybook(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapDealTemplate(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapRule(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}
