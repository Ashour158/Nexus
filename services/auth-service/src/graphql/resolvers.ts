import type { GraphQLContext } from './context.js';
import { hashPassword, verifyPassword } from '@nexus/security';

export const resolvers = {
  Query: {
    async me(_parent: unknown, _args: unknown, ctx: GraphQLContext) {
      if (!ctx.userId) return null;
      const user = await ctx.loaders.userLoader.load(ctx.userId);
      if (!user) return null;
      return mapUser(user);
    },
    async users(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const users = await ctx.prisma.user.findMany({ where, take: Math.min(limit, 100), skip: offset });
      // Prime loaders for batched resolution
      for (const user of users) {
        ctx.loaders.userLoader.prime(user.id, user);
      }
      return users.map(mapUser);
    },
    async user(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const user = await ctx.loaders.userLoader.load(id);
      if (ctx.tenantId && user?.tenantId !== ctx.tenantId) return null;
      return user ? mapUser(user) : null;
    },
    async tenants(_parent: unknown, _args: unknown, ctx: GraphQLContext) {
      const tenants = await ctx.prisma.tenant.findMany();
      for (const tenant of tenants) {
        ctx.loaders.tenantLoader.prime(tenant.id, tenant);
      }
      return tenants.map(mapTenant);
    },
    async tenant(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const tenant = await ctx.loaders.tenantLoader.load(id);
      return tenant ? mapTenant(tenant) : null;
    },
  },
  Mutation: {
    async login(_parent: unknown, { email, password }: { email: string; password: string }, ctx: GraphQLContext) {
      const user = await ctx.prisma.user.findFirst({ where: { email }, include: { tenant: true, userRoles: { include: { role: true } } } });
      if (!user || !user.passwordHash) throw new Error('INVALID_CREDENTIALS');
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) throw new Error('INVALID_CREDENTIALS');

      // Check MFA
      const mfaConfig = await ctx.prisma.mfaConfiguration.findUnique({ where: { userId: user.id } });
      if (mfaConfig?.enabledAt) {
        const mfaToken = await ctx.keyStore.sign(
          { sub: user.id, type: 'mfa_challenge', tenantId: user.tenantId },
          { expiresIn: '5m' }
        );
        return { mfaRequired: true, mfaToken, accessToken: '', refreshToken: '', user: mapUser(user), expiresIn: 0 };
      }

      const accessToken = await ctx.keyStore.sign({ sub: user.id, tenantId: user.tenantId, email: user.email, role: user.userRoles[0]?.role.name ?? 'user' }, { expiresIn: '15m' });
      const refreshToken = await ctx.keyStore.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' });
      return { accessToken, refreshToken, user: mapUser(user), expiresIn: 900 };
    },
    async logout() {
      return true;
    },
    async refreshToken() {
      throw new Error('NOT_IMPLEMENTED: use REST /auth/refresh');
    },
    async createUser(_parent: unknown, { input }: { input: Record<string, unknown> }, ctx: GraphQLContext) {
      const data = input as { email: string; password: string; firstName?: string; lastName?: string; roleId: string; tenantId: string };
      const passwordHash = await hashPassword(data.password);
      const user = await ctx.prisma.user.create({
        data: { email: data.email, passwordHash, firstName: data.firstName ?? '', lastName: data.lastName ?? '', tenantId: data.tenantId, keycloakId: crypto.randomUUID() },
        include: { tenant: true, userRoles: { include: { role: true } } },
      });
      ctx.loaders.userLoader.prime(user.id, user);
      return mapUser(user);
    },
    async updateUser(_parent: unknown, { id, input }: { id: string; input: Record<string, unknown> }, ctx: GraphQLContext) {
      if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
      const data = input as { firstName?: string; lastName?: string; roleId?: string; isActive?: boolean };
      const existing = await ctx.prisma.user.findUnique({
        where: { id_tenantId: { id, tenantId: ctx.tenantId } },
      });
      if (!existing) throw new Error('USER_NOT_FOUND');
      const user = await ctx.prisma.user.update({
        where: { id_tenantId: { id, tenantId: ctx.tenantId } },
        data: { firstName: data.firstName, lastName: data.lastName, isActive: data.isActive },
        include: { tenant: true, userRoles: { include: { role: true } } },
      });
      ctx.loaders.userLoader.clear(id).prime(id, user);
      return mapUser(user);
    },
    async deleteUser(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
      await ctx.prisma.user.delete({ where: { id_tenantId: { id, tenantId: ctx.tenantId } } });
      ctx.loaders.userLoader.clear(id);
      return true;
    },
    async createTenant(_parent: unknown, { input }: { input: Record<string, unknown> }, ctx: GraphQLContext) {
      const data = input as { name: string; domain?: string; settings?: string };
      const tenant = await ctx.prisma.tenant.create({
        data: { name: data.name, slug: data.name.toLowerCase().replace(/\s+/g, '-'), domain: data.domain, settings: data.settings ? JSON.parse(data.settings) : {} },
      });
      ctx.loaders.tenantLoader.prime(tenant.id, tenant);
      return mapTenant(tenant);
    },
    async updateTenant(_parent: unknown, { id, input }: { id: string; input: Record<string, unknown> }, ctx: GraphQLContext) {
      const data = input as { name?: string; domain?: string; settings?: string; isActive?: boolean };
      const tenant = await ctx.prisma.tenant.update({
        where: { id },
        data: { name: data.name, domain: data.domain, isActive: data.isActive },
      });
      ctx.loaders.tenantLoader.clear(id).prime(id, tenant);
      return mapTenant(tenant);
    },
  },
  User: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const user = await ctx.loaders.userLoader.load(reference.id);
      return user ? mapUser(user) : null;
    },
    async tenant(parent: any, _args: unknown, ctx: GraphQLContext) {
      const tenant = await ctx.loaders.tenantLoader.load(parent.tenantId);
      return tenant ? mapTenant(tenant) : null;
    },
    async role(parent: any, _args: unknown, ctx: GraphQLContext) {
      const roles = await ctx.loaders.roleLoader.load(parent.id);
      return mapRole(roles[0] ?? { id: '', name: 'user', permissions: [] });
    },
  },
  Tenant: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const tenant = await ctx.loaders.tenantLoader.load(reference.id);
      return tenant ? mapTenant(tenant) : null;
    },
  },
};

function mapUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatarUrl,
    role: null, // resolved via User.role field resolver with DataLoader
    tenant: null, // resolved via User.tenant field resolver with DataLoader
    tenantId: user.tenantId,
    isActive: user.isActive,
    lastLogin: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function mapTenant(tenant: any) {
  return {
    id: tenant.id,
    name: tenant.name,
    domain: tenant.slug,
    logo: null,
    settings: JSON.stringify(tenant.settings),
    isActive: tenant.isActive,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

function mapRole(role: any) {
  return { id: role.id, name: role.name, permissions: Array.isArray(role.permissions) ? role.permissions : [] };
}
