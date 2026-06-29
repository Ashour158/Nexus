import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async documents(_parent: unknown, { limit = 20, offset = 0, folderId }: { limit?: number; offset?: number; folderId?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (folderId) where.folderId = folderId;
      const items = await ctx.prisma.document.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.documentLoader.prime(item.id, item);
      return items;
    },
    async document(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.documentLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item;
    },
    async folders(_parent: unknown, { limit = 20, offset = 0, parentId }: { limit?: number; offset?: number; parentId?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (parentId !== undefined) where.parentId = parentId;
      const items = await ctx.prisma.folder.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.folderLoader.prime(item.id, item);
      return items;
    },
    async folder(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.folderLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item;
    },
    async documentVersions(_parent: unknown, { documentId }: { documentId: string }, ctx: GraphQLContext) {
      return ctx.prisma.documentVersion.findMany({ where: { documentId } });
    },
    async documentPermissions(_parent: unknown, { documentId }: { documentId: string }, ctx: GraphQLContext) {
      return ctx.prisma.documentPermission.findMany({ where: { documentId } });
    },
  },
  Mutation: {
    async createDocument(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: ctx.tenantId ?? 'default' };
      const item = await ctx.prisma.document.create({ data });
      ctx.loaders.documentLoader.prime(item.id, item);
      return item;
    },
    async updateDocument(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.document.update({ where: { id }, data: input });
      ctx.loaders.documentLoader.clear(id).prime(id, item);
      return item;
    },
    async deleteDocument(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.document.delete({ where: { id } });
      ctx.loaders.documentLoader.clear(id);
      return true;
    },
    async createFolder(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: ctx.tenantId ?? 'default' };
      const item = await ctx.prisma.folder.create({ data });
      ctx.loaders.folderLoader.prime(item.id, item);
      return item;
    },
    async updateFolder(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.folder.update({ where: { id }, data: input });
      ctx.loaders.folderLoader.clear(id).prime(id, item);
      return item;
    },
    async deleteFolder(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.folder.delete({ where: { id } });
      ctx.loaders.folderLoader.clear(id);
      return true;
    },
    async createDocumentVersion(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.documentVersion.create({ data: input });
    },
    async createDocumentPermission(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.documentPermission.create({ data: input });
    },
    async deleteDocumentPermission(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.documentPermission.delete({ where: { id } });
      return true;
    },
  },
  Document: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.documentLoader.load(reference.id);
    },
    async folder(parent: any, _args: unknown, ctx: GraphQLContext) {
      if (!parent.folderId) return null;
      return ctx.loaders.folderLoader.load(parent.folderId);
    },
    async versions(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.documentVersion.findMany({ where: { documentId: parent.id } });
    },
    async permissions(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.documentPermission.findMany({ where: { documentId: parent.id } });
    },
  },
  DocumentVersion: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.versionLoader.load(reference.id);
    },
    async document(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.loaders.documentLoader.load(parent.documentId);
    },
  },
  Folder: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.folderLoader.load(reference.id);
    },
    async parent(parent: any, _args: unknown, ctx: GraphQLContext) {
      if (!parent.parentId) return null;
      return ctx.loaders.folderLoader.load(parent.parentId);
    },
    async children(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.folder.findMany({ where: { parentId: parent.id } });
    },
    async documents(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.document.findMany({ where: { folderId: parent.id } });
    },
  },
  DocumentPermission: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.permissionLoader.load(reference.id);
    },
    async document(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.loaders.documentLoader.load(parent.documentId);
    },
  },
};
