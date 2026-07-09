import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async conversations(_parent: unknown, { limit = 20, offset = 0, channel }: { limit?: number; offset?: number; channel?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (channel) where.channel = channel;
      const items = await ctx.prisma.conversation.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.conversationLoader.prime(item.id, item);
      return items.map(mapConversation);
    },
    async conversation(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.conversationLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapConversation(item) : null;
    },
    async conversationMessages(_parent: unknown, { conversationId }: { conversationId: string }, ctx: GraphQLContext) {
      const items = await ctx.prisma.conversationMessage.findMany({ where: { conversationId } });
      for (const item of items) ctx.loaders.messageLoader.prime(item.id, item);
      return items.map(mapMessage);
    },
  },
  Mutation: {
    async createConversation(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: ctx.tenantId ?? 'default' };
      const item = await ctx.prisma.conversation.create({ data });
      ctx.loaders.conversationLoader.prime(item.id, item);
      return mapConversation(item);
    },
    async updateConversation(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.conversation.update({ where: { id }, data: input });
      ctx.loaders.conversationLoader.clear(id).prime(id, item);
      return mapConversation(item);
    },
    async deleteConversation(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.conversation.delete({ where: { id } });
      ctx.loaders.conversationLoader.clear(id);
      return true;
    },
    async createConversationMessage(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.conversationMessage.create({ data: input });
      ctx.loaders.messageLoader.prime(item.id, item);
      return mapMessage(item);
    },
  },
  Conversation: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.conversationLoader.load(reference.id);
      return item ? mapConversation(item) : null;
    },
    async messages(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.conversationMessage.findMany({ where: { conversationId: parent.id } });
      return items.map(mapMessage);
    },
  },
  ConversationMessage: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.messageLoader.load(reference.id);
      return item ? mapMessage(item) : null;
    },
    async conversation(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.conversationLoader.load(parent.conversationId);
      return item ? mapConversation(item) : null;
    },
  },
};

function mapConversation(item: any) {
  return {
    ...item,
    lastMessageAt: item.lastMessageAt?.toISOString?.() ?? item.lastMessageAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapMessage(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}
