import type { PrismaClient } from '../../../../node_modules/.prisma/document-client/index.js';
import DataLoader from 'dataloader';

export interface GraphQLContext {
  prisma: PrismaClient;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    documentLoader: DataLoader<string, any>;
    folderLoader: DataLoader<string, any>;
    versionLoader: DataLoader<string, any>;
    permissionLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: PrismaClient) {
  const documentLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.document.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const folderLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.folder.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const versionLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.documentVersion.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const permissionLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.documentPermission.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { documentLoader, folderLoader, versionLoader, permissionLoader };
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
