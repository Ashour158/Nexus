import type { PrismaClient } from '../../../node_modules/.prisma/planning-client/index.js';
import DataLoader from 'dataloader';

export interface GraphQLContext {
  prisma: PrismaClient;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    planLoader: DataLoader<string, any>;
    targetLoader: DataLoader<string, any>;
    submissionLoader: DataLoader<string, any>;
    reviewLoader: DataLoader<string, any>;
    overrideLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: PrismaClient) {
  const planLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.quotaPlan.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const targetLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.quotaTarget.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const submissionLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.forecastSubmission.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const reviewLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.forecastReview.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const overrideLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.forecastOverride.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { planLoader, targetLoader, submissionLoader, reviewLoader, overrideLoader };
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
