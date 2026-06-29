import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async fileAttachments(_parent: unknown, { limit = 20, offset = 0, entityType, entityId }: { limit?: number; offset?: number; entityType?: string; entityId?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;
      const items = await ctx.prisma.fileAttachment.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.fileLoader.prime(item.id, item);
      return items.map(mapFile);
    },
    async fileAttachment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.fileLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapFile(item) : null;
    },
  },
  Mutation: {
    async createFileAttachment(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.fileAttachment.create({ data: input });
      ctx.loaders.fileLoader.prime(item.id, item);
      return mapFile(item);
    },
    async deleteFileAttachment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.fileAttachment.delete({ where: { id } });
      ctx.loaders.fileLoader.clear(id);
      return true;
    },
  },
  FileAttachment: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.fileLoader.load(reference.id);
      return item ? mapFile(item) : null;
    },
  },
};

function mapFile(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}
