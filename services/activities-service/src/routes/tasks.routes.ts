import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { PaginationSchema } from '@nexus/validation';
import type { ActivitiesPrisma } from '../prisma.js';

export async function registerTasksRoutes(
  app: FastifyInstance,
  prisma: ActivitiesPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/tasks',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const where = { tenantId: jwt.tenantId, type: 'TASK' as const, deletedAt: null as null };
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where }),
            prisma.activity.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { dueDate: 'asc' } }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.get(
        '/tasks/overdue',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const where: any = { tenantId: jwt.tenantId, type: 'TASK', deletedAt: null, dueDate: { lt: new Date() }, status: { in: ['PLANNED', 'IN_PROGRESS'] } };
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where }),
            prisma.activity.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { dueDate: 'asc' } }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.get(
        '/tasks/due-today',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const end = new Date(); end.setHours(23, 59, 59, 999);
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where: { tenantId: jwt.tenantId, type: 'TASK', deletedAt: null, dueDate: { gte: start, lte: end } } }),
            prisma.activity.findMany({
              where: { tenantId: jwt.tenantId, type: 'TASK', deletedAt: null, dueDate: { gte: start, lte: end } },
              orderBy: { dueDate: 'asc' },
              skip: (q.page - 1) * q.limit,
              take: q.limit,
            }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
