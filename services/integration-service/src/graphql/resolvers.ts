import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async webhookSubscriptions(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.webhookSubscription.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.subscriptionLoader.prime(item.id, item);
      return items.map(mapSubscription);
    },
    async webhookSubscription(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.subscriptionLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapSubscription(item) : null;
    },
    async webhookDeliveries(_parent: unknown, { subscriptionId }: { subscriptionId: string }, ctx: GraphQLContext) {
      const items = await ctx.prisma.webhookDelivery.findMany({ where: { subscriptionId } });
      for (const item of items) ctx.loaders.deliveryLoader.prime(item.id, item);
      return items.map(mapDelivery);
    },
    async oAuthConnections(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.oAuthConnection.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.connectionLoader.prime(item.id, item);
      return items.map(mapConnection);
    },
    async oAuthConnection(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.connectionLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapConnection(item) : null;
    },
    async syncJobs(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.syncJob.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.syncJobLoader.prime(item.id, item);
      return items.map(mapSyncJob);
    },
    async syncJob(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.syncJobLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapSyncJob(item) : null;
    },
    async syncedCalendarEvents(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.syncedCalendarEvent.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.calendarEventLoader.prime(item.id, item);
      return items.map(mapCalendarEvent);
    },
    async syncedCalendarEvent(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.calendarEventLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapCalendarEvent(item) : null;
    },
    async geocodedAccounts(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.geocodedAccount.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.geocodedAccountLoader.prime(item.id, item);
      return items.map(mapGeocodedAccount);
    },
    async geocodedAccount(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.geocodedAccountLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapGeocodedAccount(item) : null;
    },
  },
  Mutation: {
    async createWebhookSubscription(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.webhookSubscription.create({ data: input });
      ctx.loaders.subscriptionLoader.prime(item.id, item);
      return mapSubscription(item);
    },
    async updateWebhookSubscription(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.webhookSubscription.update({ where: { id }, data: input });
      ctx.loaders.subscriptionLoader.clear(id).prime(id, item);
      return mapSubscription(item);
    },
    async deleteWebhookSubscription(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.webhookSubscription.delete({ where: { id } });
      ctx.loaders.subscriptionLoader.clear(id);
      return true;
    },
    async createOAuthConnection(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.oAuthConnection.create({ data: input });
      ctx.loaders.connectionLoader.prime(item.id, item);
      return mapConnection(item);
    },
    async updateOAuthConnection(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.oAuthConnection.update({ where: { id }, data: input });
      ctx.loaders.connectionLoader.clear(id).prime(id, item);
      return mapConnection(item);
    },
    async deleteOAuthConnection(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.oAuthConnection.delete({ where: { id } });
      ctx.loaders.connectionLoader.clear(id);
      return true;
    },
    async createSyncJob(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.syncJob.create({ data: input });
      ctx.loaders.syncJobLoader.prime(item.id, item);
      return mapSyncJob(item);
    },
    async updateSyncJob(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.syncJob.update({ where: { id }, data: input });
      ctx.loaders.syncJobLoader.clear(id).prime(id, item);
      return mapSyncJob(item);
    },
    async deleteSyncJob(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.syncJob.delete({ where: { id } });
      ctx.loaders.syncJobLoader.clear(id);
      return true;
    },
    async createSyncedCalendarEvent(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.syncedCalendarEvent.create({ data: input });
      ctx.loaders.calendarEventLoader.prime(item.id, item);
      return mapCalendarEvent(item);
    },
    async deleteSyncedCalendarEvent(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.syncedCalendarEvent.delete({ where: { id } });
      ctx.loaders.calendarEventLoader.clear(id);
      return true;
    },
    async createGeocodedAccount(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.geocodedAccount.create({ data: input });
      ctx.loaders.geocodedAccountLoader.prime(item.id, item);
      return mapGeocodedAccount(item);
    },
    async updateGeocodedAccount(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.geocodedAccount.update({ where: { id }, data: input });
      ctx.loaders.geocodedAccountLoader.clear(id).prime(id, item);
      return mapGeocodedAccount(item);
    },
    async deleteGeocodedAccount(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.geocodedAccount.delete({ where: { id } });
      ctx.loaders.geocodedAccountLoader.clear(id);
      return true;
    },
  },
  WebhookSubscription: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.subscriptionLoader.load(reference.id);
      return item ? mapSubscription(item) : null;
    },
    async deliveries(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.webhookDelivery.findMany({ where: { subscriptionId: parent.id } });
      return items.map(mapDelivery);
    },
  },
  WebhookDelivery: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.deliveryLoader.load(reference.id);
      return item ? mapDelivery(item) : null;
    },
    async subscription(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.subscriptionLoader.load(parent.subscriptionId);
      return item ? mapSubscription(item) : null;
    },
  },
  OAuthConnection: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.connectionLoader.load(reference.id);
      return item ? mapConnection(item) : null;
    },
    async syncJobs(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.syncJob.findMany({ where: { connectionId: parent.id } });
      return items.map(mapSyncJob);
    },
  },
  SyncJob: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.syncJobLoader.load(reference.id);
      return item ? mapSyncJob(item) : null;
    },
    async connection(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.connectionLoader.load(parent.connectionId);
      return item ? mapConnection(item) : null;
    },
  },
  SyncedCalendarEvent: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.calendarEventLoader.load(reference.id);
      return item ? mapCalendarEvent(item) : null;
    },
  },
  GeocodedAccount: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.geocodedAccountLoader.load(reference.id);
      return item ? mapGeocodedAccount(item) : null;
    },
  },
};

function mapSubscription(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapDelivery(item: any) {
  return {
    ...item,
    nextRetryAt: item.nextRetryAt?.toISOString?.() ?? item.nextRetryAt,
    deliveredAt: item.deliveredAt?.toISOString?.() ?? item.deliveredAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}

function mapConnection(item: any) {
  return {
    ...item,
    expiresAt: item.expiresAt?.toISOString?.() ?? item.expiresAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapSyncJob(item: any) {
  return {
    ...item,
    startedAt: item.startedAt?.toISOString?.() ?? item.startedAt,
    completedAt: item.completedAt?.toISOString?.() ?? item.completedAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}

function mapCalendarEvent(item: any) {
  return {
    ...item,
    syncedAt: item.syncedAt?.toISOString?.() ?? item.syncedAt,
  };
}

function mapGeocodedAccount(item: any) {
  return {
    ...item,
    geocodedAt: item.geocodedAt?.toISOString?.() ?? item.geocodedAt,
  };
}
