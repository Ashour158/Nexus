import DataLoader from 'dataloader';
import type { StoragePrisma } from '../prisma.js';

export interface GraphQLContext {
  prisma: StoragePrisma;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    fileLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: StoragePrisma) {
  const fileLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.fileAttachment.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { fileLoader };
}

export function buildContext(prisma: StoragePrisma) {
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
