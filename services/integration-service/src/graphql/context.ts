import type { PrismaClient } from '@prisma/client';
import DataLoader from 'dataloader';

export interface GraphQLContext {
  prisma: PrismaClient;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    subscriptionLoader: DataLoader<string, any>;
    deliveryLoader: DataLoader<string, any>;
    connectionLoader: DataLoader<string, any>;
    syncJobLoader: DataLoader<string, any>;
    calendarEventLoader: DataLoader<string, any>;
    geocodedAccountLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: PrismaClient) {
  const subscriptionLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.webhookSubscription.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const deliveryLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.webhookDelivery.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const connectionLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.oAuthConnection.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const syncJobLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.syncJob.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const calendarEventLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.syncedCalendarEvent.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const geocodedAccountLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.geocodedAccount.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { subscriptionLoader, deliveryLoader, connectionLoader, syncJobLoader, calendarEventLoader, geocodedAccountLoader };
}

export function buildContext(prisma: PrismaClient) {
  return async function createContext({ request }: { request: Request }): Promise<GraphQLContext> {
    let tenantId: string | null = request.headers.get('x-tenant-id');
    let userId: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(authHeader.split('.')[1], 'base64').toString());
        tenantId = payload.tenantId ?? tenantId;
        userId = payload.sub ?? null;
      } catch { /* ignore */ }
    }
    return { prisma, tenantId, userId, loaders: createLoaders(prisma) };
  };
}
