import DataLoader from 'dataloader';
import type { PrismaClient as EmailSyncPrisma } from '../../../../node_modules/.prisma/email-sync-client/index.js';

export interface GraphQLContext {
  prisma: EmailSyncPrisma;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    connectionLoader: DataLoader<string, any>;
    messageLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: EmailSyncPrisma) {
  const connectionLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.emailConnection.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const messageLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.emailMessage.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { connectionLoader, messageLoader };
}

export function buildContext(prisma: EmailSyncPrisma) {
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
