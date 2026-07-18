import DataLoader from 'dataloader';
import type { KnowledgePrisma } from '../prisma.js';

export interface GraphQLContext {
  prisma: KnowledgePrisma;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    categoryLoader: DataLoader<string, any>;
    articleLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: KnowledgePrisma) {
  const categoryLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.kbCategory.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const articleLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.kbArticle.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { categoryLoader, articleLoader };
}

export function buildContext(prisma: KnowledgePrisma) {
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
