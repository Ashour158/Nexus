import DataLoader from 'dataloader';
import type { PrismaClient } from '@prisma/client';

export interface GraphQLLoaders {
  userLoader: DataLoader<string, any>;
  tenantLoader: DataLoader<string, any>;
  roleLoader: DataLoader<string, any[]>;
}

export function createLoaders(prisma: PrismaClient): GraphQLLoaders {
  const userLoader = new DataLoader<string, any>(async (ids) => {
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
      include: { tenant: true, userRoles: { include: { role: true } } },
    });
    const map = new Map(users.map((u: any) => [u.id, u]));
    return ids.map((id) => map.get(id) ?? null);
  });

  const tenantLoader = new DataLoader<string, any>(async (ids) => {
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: [...ids] } },
    });
    const map = new Map(tenants.map((t: any) => [t.id, t]));
    return ids.map((id) => map.get(id) ?? null);
  });

  const roleLoader = new DataLoader<string, any[]>(async (userIds) => {
    const userRoles = await prisma.userRole.findMany({
      where: { userId: { in: [...userIds] } },
      include: { role: true },
    });
    const map = new Map<string, any[]>();
    for (const ur of userRoles) {
      const list = map.get(ur.userId) ?? [];
      list.push(ur.role);
      map.set(ur.userId, list);
    }
    return userIds.map((id) => map.get(id) ?? []);
  });

  return { userLoader, tenantLoader, roleLoader };
}
