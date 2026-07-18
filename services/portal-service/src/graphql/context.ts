import type { PortalPrisma } from '../prisma.js';
import DataLoader from 'dataloader';

// The portal Prisma client is generated to a custom output path (see prisma.ts),
// so the default `@prisma/client` package exports no PrismaClient here — use the
// service-local PortalPrisma type instead.
type PrismaClient = PortalPrisma;

export interface GraphQLContext {
  prisma: PrismaClient;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    tokenLoader: DataLoader<string, any>;
    brandingLoader: DataLoader<string, any>;
    auditLogLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: PrismaClient) {
  const tokenLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.portalToken.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const brandingLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.portalBranding.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const auditLogLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.portalAuditLog.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { tokenLoader, brandingLoader, auditLogLoader };
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
