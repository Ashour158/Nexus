import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async kbCategories(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.kbCategory.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.categoryLoader.prime(item.id, item);
      return items;
    },
    async kbCategory(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.categoryLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item;
    },
    async kbArticles(_parent: unknown, { limit = 20, offset = 0, status }: { limit?: number; offset?: number; status?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (status) where.status = status;
      const items = await ctx.prisma.kbArticle.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.articleLoader.prime(item.id, item);
      return items.map(mapArticle);
    },
    async kbArticle(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.articleLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapArticle(item) : null;
    },
    async kbViews(_parent: unknown, { articleId }: { articleId: string }, ctx: GraphQLContext) {
      return ctx.prisma.kbView.findMany({ where: { articleId } });
    },
  },
  Mutation: {
    async createKbCategory(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: ctx.tenantId ?? 'default' };
      const item = await ctx.prisma.kbCategory.create({ data });
      ctx.loaders.categoryLoader.prime(item.id, item);
      return item;
    },
    async updateKbCategory(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.kbCategory.update({ where: { id }, data: input });
      ctx.loaders.categoryLoader.clear(id).prime(id, item);
      return item;
    },
    async deleteKbCategory(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.kbCategory.delete({ where: { id } });
      ctx.loaders.categoryLoader.clear(id);
      return true;
    },
    async createKbArticle(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: ctx.tenantId ?? 'default' };
      const item = await ctx.prisma.kbArticle.create({ data });
      ctx.loaders.articleLoader.prime(item.id, item);
      return mapArticle(item);
    },
    async updateKbArticle(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.kbArticle.update({ where: { id }, data: input });
      ctx.loaders.articleLoader.clear(id).prime(id, item);
      return mapArticle(item);
    },
    async deleteKbArticle(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.kbArticle.delete({ where: { id } });
      ctx.loaders.articleLoader.clear(id);
      return true;
    },
    async createKbView(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.kbView.create({ data: input });
    },
  },
  KbCategory: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.categoryLoader.load(reference.id);
    },
    async parent(parent: any, _args: unknown, ctx: GraphQLContext) {
      if (!parent.parentCategoryId) return null;
      return ctx.loaders.categoryLoader.load(parent.parentCategoryId);
    },
    async children(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.kbCategory.findMany({ where: { parentCategoryId: parent.id } });
    },
    async articles(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.kbArticle.findMany({ where: { categoryId: parent.id } });
    },
  },
  KbArticle: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.articleLoader.load(reference.id);
      return item ? mapArticle(item) : null;
    },
    async category(parent: any, _args: unknown, ctx: GraphQLContext) {
      if (!parent.categoryId) return null;
      return ctx.loaders.categoryLoader.load(parent.categoryId);
    },
    async views(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.kbView.findMany({ where: { articleId: parent.id } });
    },
  },
  KbView: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.kbView.findUnique({ where: { id: reference.id } });
    },
    async article(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.loaders.articleLoader.load(parent.articleId);
    },
  },
};

function mapArticle(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}
