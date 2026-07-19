import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { AuthPrisma } from '../prisma.js';

function isAdmin(jwt: JwtPayload): boolean {
  // Accept the seeded SUPER_ADMIN role too (was admin/ADMIN only, which 403'd
  // the super admin on profile/team routes). Case-insensitive.
  const roles = (jwt.roles ?? []).map((r) => r.toLowerCase());
  return roles.some((r) => r === 'admin' || r === 'super_admin' || r === 'superadmin');
}

export async function registerProfileRoutes(app: FastifyInstance, prisma: AuthPrisma): Promise<void> {
  await app.register(async (r) => {
    r.get('/profile/me', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const prismaAny = prisma as any;
      const user = await prismaAny.user.findFirst({
        where: { id: jwt.sub, tenantId: jwt.tenantId },
        include: { profile: true, userRoles: { include: { role: true } } },
      });
      if (!user) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: req.id } });
      return reply.send({ success: true, data: user });
    });

    r.get('/profile/users/:id', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { id } = req.params as { id: string };
      if (!isAdmin(jwt) && jwt.sub !== id) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      }
      const prismaAny = prisma as any;
      const user = await prismaAny.user.findFirst({
        where: { id, tenantId: jwt.tenantId },
        include: { profile: true, userRoles: { include: { role: true } } },
      });
      if (!user) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: req.id } });
      return reply.send({ success: true, data: user });
    });

    const ProfileUpdateSchema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      phone: z.string().max(50).optional(),
      locale: z.string().max(10).optional(),
      timezone: z.string().max(50).optional(),
      avatarUrl: z.string().url().max(2048).optional(),
      notificationPrefs: z.record(z.unknown()).optional(),
      dashboardLayout: z.record(z.unknown()).optional(),
    }).strict();

    const AdminProfileUpdateSchema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      phone: z.string().max(50).optional(),
      locale: z.string().max(10).optional(),
      timezone: z.string().max(50).optional(),
      avatarUrl: z.string().url().max(2048).optional(),
      isActive: z.boolean().optional(),
      notificationPrefs: z.record(z.unknown()).optional(),
      dashboardLayout: z.record(z.unknown()).optional(),
    }).strict();

    r.put('/profile/me', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const body = ProfileUpdateSchema.parse(req.body);
      const userFields = ['firstName', 'lastName', 'phone', 'locale', 'timezone', 'avatarUrl'];
      const userUpdates: Record<string, unknown> = {};
      const profileUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (userFields.includes(key)) userUpdates[key] = value;
        else profileUpdates[key] = value;
      }
      const prismaAny = prisma as any;
      const user = await prismaAny.user.update({
        where: { id_tenantId: { id: jwt.sub, tenantId: jwt.tenantId } },
        data: {
          ...userUpdates,
          profile: {
            upsert: {
              create: { tenantId: jwt.tenantId, ...profileUpdates },
              update: profileUpdates,
            },
          },
        },
        include: { profile: true },
      });
      return reply.send({ success: true, data: user });
    });

    r.put('/profile/users/:id', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      if (!isAdmin(jwt)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      const { id } = req.params as { id: string };
      const body = AdminProfileUpdateSchema.parse(req.body);
      const userFields = ['firstName', 'lastName', 'phone', 'locale', 'timezone', 'avatarUrl', 'isActive'];
      const userUpdates: Record<string, unknown> = {};
      const profileUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (userFields.includes(key)) userUpdates[key] = value;
        else profileUpdates[key] = value;
      }
      const prismaAny = prisma as any;
      const user = await prismaAny.user.update({
        where: { id_tenantId: { id, tenantId: jwt.tenantId } },
        data: {
          ...userUpdates,
          profile: {
            upsert: {
              create: { tenantId: jwt.tenantId, ...profileUpdates },
              update: profileUpdates,
            },
          },
        },
        include: { profile: true },
      });
      return reply.send({ success: true, data: user });
    });

    r.post('/profile/me/avatar', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const { avatarUrl } = req.body as { avatarUrl?: string };
      if (!avatarUrl) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'avatarUrl required', requestId: req.id } });
      const urlSchema = z.string().url().max(2048);
      const validatedUrl = urlSchema.parse(avatarUrl);
      await (prisma as any).user.update({ where: { id_tenantId: { id: jwt.sub, tenantId: jwt.tenantId } }, data: { avatarUrl: validatedUrl } });
      return reply.send({ success: true });
    });

    r.get('/profile/team', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const q = (req.query as Record<string, string>);
      const page = Math.max(1, Number(q.page ?? 1));
      const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
      const [total, users] = await Promise.all([
        (prisma as any).user.count({ where: { tenantId: jwt.tenantId, isActive: true } }),
        (prisma as any).user.findMany({
          where: { tenantId: jwt.tenantId, isActive: true },
          include: { profile: true, userRoles: { include: { role: true } } },
          orderBy: [{ firstName: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return reply.send({ success: true, data: users, total, page, limit });
    });
  }, { prefix: '/api/v1' });
}
