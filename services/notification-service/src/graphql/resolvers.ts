import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async notifications(_parent: unknown, { limit = 20, offset = 0, isRead }: { limit?: number; offset?: number; isRead?: boolean }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (isRead !== undefined) where.isRead = isRead;
      const items = await ctx.prisma.notification.findMany({ where, take: Math.min(limit, 100), skip: offset, orderBy: { createdAt: 'desc' } });
      for (const item of items) ctx.loaders.notificationLoader.prime(item.id, item);
      return items.map(mapNotification);
    },
    async notification(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.notificationLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapNotification(item) : null;
    },
  },
  Mutation: {
    async createNotification(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.notification.create({ data: input });
      ctx.loaders.notificationLoader.prime(item.id, item);
      return mapNotification(item);
    },
    async markNotificationRead(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
      ctx.loaders.notificationLoader.clear(id).prime(id, item);
      return mapNotification(item);
    },
    async markAllNotificationsRead(_parent: unknown, _args: unknown, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId, isRead: false } : { isRead: false };
      await ctx.prisma.notification.updateMany({ where, data: { isRead: true, readAt: new Date() } });
      return true;
    },
    async deleteNotification(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.notification.delete({ where: { id } });
      ctx.loaders.notificationLoader.clear(id);
      return true;
    },
  },
  Notification: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.notificationLoader.load(reference.id);
      return item ? mapNotification(item) : null;
    },
  },
};

function mapNotification(item: any) {
  return {
    ...item,
    readAt: item.readAt?.toISOString?.() ?? item.readAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}
