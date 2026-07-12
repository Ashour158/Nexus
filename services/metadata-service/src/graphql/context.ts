import type { PrismaClient } from '../../../../node_modules/.prisma/metadata-client/index.js';
import DataLoader from 'dataloader';
import { verifyBearerToken } from '@nexus/service-utils';

export interface GraphQLContext {
  prisma: PrismaClient;
  tenantId: string | null;
  userId: string | null;
  permissions: string[];
  roles: string[];
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
    let permissions: string[] = [];
    let roles: string[] = [];

    // Cryptographically verify the JWT (RS256 via AUTH_JWKS_URL, else HS256 via
    // JWT_SECRET) — the same trust model the REST routes enforce. An invalid or
    // missing token yields an unauthenticated context rather than trusted claims.
    const payload = await verifyBearerToken(request.headers.get('authorization'));
    if (payload) {
      // Prefer the verified token's tenant over any client-supplied header.
      tenantId = payload.tenantId ?? tenantId;
      userId = payload.sub ?? null;
      permissions = payload.permissions ?? [];
      roles = payload.roles ?? [];
    }

    return { prisma, tenantId, userId, permissions, roles, loaders: createLoaders(prisma) };
  };
}
