import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async recycleBinItems(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.recycleBinItem.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.recycleLoader.prime(item.id, item);
      return items.map(mapRecycle);
    },
    async recycleBinItem(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.recycleLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapRecycle(item) : null;
    },
    async fieldAuditLogs(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.fieldAuditLog.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.auditLoader.prime(item.id, item);
      return items.map(mapAudit);
    },
    async fieldAuditLog(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.auditLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapAudit(item) : null;
    },
    async savedViews(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.savedView.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.viewLoader.prime(item.id, item);
      return items.map(mapView);
    },
    async savedView(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.viewLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapView(item) : null;
    },
    async recentRecords(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.recentRecord.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.recentLoader.prime(item.id, item);
      return items.map(mapRecent);
    },
    async recentRecord(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.recentLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapRecent(item) : null;
    },
    async importJobs(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.importJob.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.importLoader.prime(item.id, item);
      return items.map(mapImport);
    },
    async importJob(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.importLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapImport(item) : null;
    },
  },
  Mutation: {
    async createRecycleBinItem(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.recycleBinItem.create({ data: input });
      ctx.loaders.recycleLoader.prime(item.id, item);
      return mapRecycle(item);
    },
    async deleteRecycleBinItem(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.recycleBinItem.delete({ where: { id } });
      ctx.loaders.recycleLoader.clear(id);
      return true;
    },
    async createFieldAuditLog(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.fieldAuditLog.create({ data: input });
      ctx.loaders.auditLoader.prime(item.id, item);
      return mapAudit(item);
    },
    async createSavedView(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.savedView.create({ data: input });
      ctx.loaders.viewLoader.prime(item.id, item);
      return mapView(item);
    },
    async updateSavedView(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.savedView.update({ where: { id }, data: input });
      ctx.loaders.viewLoader.clear(id).prime(id, item);
      return mapView(item);
    },
    async deleteSavedView(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.savedView.delete({ where: { id } });
      ctx.loaders.viewLoader.clear(id);
      return true;
    },
    async createRecentRecord(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.recentRecord.create({ data: input });
      ctx.loaders.recentLoader.prime(item.id, item);
      return mapRecent(item);
    },
    async deleteRecentRecord(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.recentRecord.delete({ where: { id } });
      ctx.loaders.recentLoader.clear(id);
      return true;
    },
    async createImportJob(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.importJob.create({ data: input });
      ctx.loaders.importLoader.prime(item.id, item);
      return mapImport(item);
    },
    async updateImportJob(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.importJob.update({ where: { id }, data: input });
      ctx.loaders.importLoader.clear(id).prime(id, item);
      return mapImport(item);
    },
  },
  RecycleBinItem: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.recycleLoader.load(reference.id);
      return item ? mapRecycle(item) : null;
    },
  },
  FieldAuditLog: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.auditLoader.load(reference.id);
      return item ? mapAudit(item) : null;
    },
  },
  SavedView: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.viewLoader.load(reference.id);
      return item ? mapView(item) : null;
    },
  },
  RecentRecord: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.recentLoader.load(reference.id);
      return item ? mapRecent(item) : null;
    },
  },
  ImportJob: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.importLoader.load(reference.id);
      return item ? mapImport(item) : null;
    },
  },
};

function mapRecycle(item: any) {
  return {
    ...item,
    deletedAt: item.deletedAt?.toISOString?.() ?? item.deletedAt,
    expiresAt: item.expiresAt?.toISOString?.() ?? item.expiresAt,
  };
}

function mapAudit(item: any) {
  return {
    ...item,
    changedAt: item.changedAt?.toISOString?.() ?? item.changedAt,
  };
}

function mapView(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapRecent(item: any) {
  return {
    ...item,
    viewedAt: item.viewedAt?.toISOString?.() ?? item.viewedAt,
  };
}

function mapImport(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    completedAt: item.completedAt?.toISOString?.() ?? item.completedAt,
  };
}
