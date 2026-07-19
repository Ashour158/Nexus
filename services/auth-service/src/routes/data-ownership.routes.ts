import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import type { NexusProducer } from '@nexus/kafka';
import type { AuthPrisma } from '../prisma.js';

function isAdmin(jwt: JwtPayload): boolean {
  // The seeded super-admin role is `SUPER_ADMIN` (see seed-demo.mjs); the old
  // check only accepted `admin`/`ADMIN`, so it denied the super admin on the
  // governance routes. Accept any admin/super-admin role, case-insensitively.
  const roles = (jwt.roles ?? []).map((r) => r.toLowerCase());
  return roles.some((r) => r === 'admin' || r === 'super_admin' || r === 'superadmin');
}

export async function registerDataOwnershipRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma,
  producer: NexusProducer
): Promise<void> {
  await app.register(async (r) => {
    r.post('/data-ownership/transfer', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      if (!isAdmin(jwt)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      const { fromUserId, toUserId, modules } = req.body as { fromUserId?: string; toUserId?: string; modules?: string[] };
      if (!fromUserId || !toUserId) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'fromUserId and toUserId required', requestId: req.id } });
      }
      const [fromUser, toUser] = await Promise.all([
        (prisma as any).user.findFirst({ where: { id: fromUserId, tenantId: jwt.tenantId } }),
        (prisma as any).user.findFirst({ where: { id: toUserId, tenantId: jwt.tenantId } }),
      ]);
      if (!fromUser || !toUser) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found in tenant', requestId: req.id } });

      await (prisma as any).auditLog.create({
        data: {
          tenantId: jwt.tenantId,
          userId: jwt.sub,
          action: 'DATA_TRANSFER',
          resource: 'user',
          resourceId: fromUserId,
          newValue: { toUserId, modules },
        },
      });

      await producer.publish('data.ownership.transfer', {
        type: 'data.ownership.transfer',
        tenantId: jwt.tenantId,
        fromUserId,
        toUserId,
        modules: (modules ?? []).includes('all')
          ? ['contacts', 'deals', 'leads', 'activities', 'notes', 'accounts']
          : modules ?? [],
        requestedBy: jwt.sub,
        requestedAt: new Date().toISOString(),
      });

      return reply.send({
        success: true,
        message: `Transfer initiated from ${fromUser.firstName} to ${toUser.firstName}. Records will be reassigned within 60 seconds.`,
      });
    });

    // Deprecated: use POST /gdpr/erasure instead (canonical endpoint with DB record + audit trail)
    r.post('/data-ownership/gdpr-erasure', async (_req, reply) => {
      return reply.code(301).redirect('/api/v1/gdpr/erasure');
    });

    r.get('/data-ownership/audit', async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      if (!isAdmin(jwt)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: req.id } });
      const { resource, limit = '50', offset = '0' } = req.query as { resource?: string; limit?: string; offset?: string };
      const where: Record<string, unknown> = { tenantId: jwt.tenantId };
      if (resource) where.resource = resource;

      const [total, logs] = await Promise.all([
        (prisma as any).auditLog.count({ where }),
        (prisma as any).auditLog.findMany({
          where,
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: Number(limit),
          skip: Number(offset),
        }),
      ]);

      return reply.send({ success: true, data: { total, logs } });
    });
  }, { prefix: '/api/v1' });
}
