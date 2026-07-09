import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async emailConnections(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.emailConnection.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.connectionLoader.prime(item.id, item);
      return items.map(mapConnection);
    },
    async emailConnection(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.connectionLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapConnection(item) : null;
    },
    async emailConnectionByUser(_parent: unknown, { userId }: { userId: string }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailConnection.findUnique({ where: { userId } });
      return item ? mapConnection(item) : null;
    },
    async emailMessages(_parent: unknown, { limit = 20, offset = 0, userId, threadId }: { limit?: number; offset?: number; userId?: string; threadId?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (userId) where.userId = userId;
      if (threadId) where.threadId = threadId;
      const items = await ctx.prisma.emailMessage.findMany({ where, take: Math.min(limit, 100), skip: offset, orderBy: { sentAt: 'desc' } });
      for (const item of items) ctx.loaders.messageLoader.prime(item.id, item);
      return items.map(mapMessage);
    },
    async emailMessage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.messageLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapMessage(item) : null;
    },
    async emailThreads(_parent: unknown, { userId, limit = 20, offset = 0 }: { userId: string; limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where: any = { userId, ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}) };
      const messages = await ctx.prisma.emailMessage.findMany({ where, orderBy: { sentAt: 'desc' }, take: Math.min(limit * 5, 500), skip: offset * 5 });
      const threadMap = new Map<string, typeof messages>();
      for (const m of messages) {
        const list = threadMap.get(m.threadId) ?? [];
        list.push(m);
        threadMap.set(m.threadId, list);
      }
      return Array.from(threadMap.entries()).slice(0, limit).map(([threadId, msgs]) => ({
        id: threadId,
        userId,
        subject: msgs[0].subject,
        from: msgs[0].from,
        snippet: msgs[0].snippet,
        sentAt: msgs[0].sentAt.toISOString(),
        isRead: msgs.every((m: any) => m.isRead),
        messageCount: msgs.length,
        dealId: msgs[0].dealId,
        contactId: msgs[0].contactId,
      }));
    },
  },
  Mutation: {
    async createEmailConnection(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailConnection.create({ data: input });
      ctx.loaders.connectionLoader.prime(item.id, item);
      return mapConnection(item);
    },
    async updateEmailConnection(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailConnection.update({ where: { id }, data: input });
      ctx.loaders.connectionLoader.clear(id).prime(id, item);
      return mapConnection(item);
    },
    async deleteEmailConnection(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.emailConnection.delete({ where: { id } });
      ctx.loaders.connectionLoader.clear(id);
      return true;
    },
    async createEmailMessage(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailMessage.create({ data: input });
      ctx.loaders.messageLoader.prime(item.id, item);
      return mapMessage(item);
    },
    async updateEmailMessage(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailMessage.update({ where: { id }, data: input });
      ctx.loaders.messageLoader.clear(id).prime(id, item);
      return mapMessage(item);
    },
    async deleteEmailMessage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.emailMessage.delete({ where: { id } });
      ctx.loaders.messageLoader.clear(id);
      return true;
    },
  },
  EmailConnection: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.connectionLoader.load(reference.id);
      return item ? mapConnection(item) : null;
    },
  },
  EmailMessage: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.messageLoader.load(reference.id);
      return item ? mapMessage(item) : null;
    },
  },
};

function mapConnection(item: any) {
  return {
    ...item,
    tokenExpiry: item.tokenExpiry?.toISOString?.() ?? item.tokenExpiry,
    lastSyncAt: item.lastSyncAt?.toISOString?.() ?? item.lastSyncAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}

function mapMessage(item: any) {
  return {
    ...item,
    sentAt: item.sentAt?.toISOString?.() ?? item.sentAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}
