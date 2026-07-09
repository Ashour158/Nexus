import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async portalTokens(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.portalToken.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.tokenLoader.prime(item.id, item);
      return items.map(mapToken);
    },
    async portalToken(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.tokenLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapToken(item) : null;
    },
    async portalBranding(_parent: unknown, { tenantId }: { tenantId: string }, ctx: GraphQLContext) {
      return ctx.prisma.portalBranding.findUnique({ where: { tenantId } });
    },
    async portalAuditLogs(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.portalAuditLog.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.auditLogLoader.prime(item.id, item);
      return items;
    },
    async portalAuditLog(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.auditLogLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item;
    },
  },
  Mutation: {
    async createPortalToken(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.portalToken.create({ data: input });
      ctx.loaders.tokenLoader.prime(item.id, item);
      return mapToken(item);
    },
    async revokePortalToken(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.portalToken.delete({ where: { id } });
      ctx.loaders.tokenLoader.clear(id);
      return true;
    },
    async updatePortalBranding(_parent: unknown, { tenantId, input }: { tenantId: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.portalBranding.upsert({
        where: { tenantId },
        update: input,
        create: { ...input, tenantId },
      });
      ctx.loaders.brandingLoader.prime(item.id, item);
      return item;
    },
    async createPortalAuditLog(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.portalAuditLog.create({ data: input });
      ctx.loaders.auditLogLoader.prime(item.id, item);
      return item;
    },
  },
  PortalToken: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.tokenLoader.load(reference.id);
      return item ? mapToken(item) : null;
    },
  },
  PortalBranding: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.brandingLoader.load(reference.id);
    },
  },
  PortalAuditLog: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.auditLogLoader.load(reference.id);
    },
  },
};

function mapToken(item: any) {
  return {
    ...item,
    expiresAt: item.expiresAt?.toISOString?.() ?? item.expiresAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}
