import type { PrismaClient } from '@prisma/client';
import DataLoader from 'dataloader';

export interface GraphQLContext {
  prisma: PrismaClient;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    fieldDefLoader: DataLoader<string, any>;
    permissionLoader: DataLoader<string, any>;
    ruleLoader: DataLoader<string, any>;
    changeLogLoader: DataLoader<string, any>;
    dupGroupLoader: DataLoader<string, any>;
    tagLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: PrismaClient) {
  const fieldDefLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.customFieldDefinition.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const permissionLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.fieldPermission.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const ruleLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.validationRule.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const changeLogLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.fieldChangeLog.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const dupGroupLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.duplicateGroup.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const tagLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.tag.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { fieldDefLoader, permissionLoader, ruleLoader, changeLogLoader, dupGroupLoader, tagLoader };
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
