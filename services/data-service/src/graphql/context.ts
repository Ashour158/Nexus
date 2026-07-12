import type { DataPrisma as PrismaClient } from '../prisma.js';
import DataLoader from 'dataloader';

export interface GraphQLContext {
  prisma: PrismaClient;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    recycleLoader: DataLoader<string, any>;
    auditLoader: DataLoader<string, any>;
    viewLoader: DataLoader<string, any>;
    recentLoader: DataLoader<string, any>;
    importLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: PrismaClient) {
  const recycleLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.recycleBinItem.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const auditLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.fieldAuditLog.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const viewLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.savedView.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const recentLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.recentRecord.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const importLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.importJob.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { recycleLoader, auditLoader, viewLoader, recentLoader, importLoader };
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
