import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { PaginationSchema } from '@nexus/validation';
import type { ActivitiesPrisma } from '../prisma.js';

export async function registerMeetingsRoutes(
  app: FastifyInstance,
  prisma: ActivitiesPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/meetings',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const where = { tenantId: jwt.tenantId, type: 'MEETING' as const };
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where }),
            prisma.activity.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { startDate: 'asc' } }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.get(
        '/meetings/upcoming',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const now = new Date();
          const rows = await prisma.activity.findMany({
            where: { tenantId: jwt.tenantId, type: 'MEETING', startDate: { gte: now }, status: { in: ['PLANNED', 'IN_PROGRESS'] as const } },
            orderBy: { startDate: 'asc' },
            take: 50,
          });
          return reply.send({ success: true, data: rows });
        }
      );

      // Calendar integration hooks
      r.post(
        '/meetings/:id/calendar-sync',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const activity = await prisma.activity.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!activity) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          const updated = await prisma.activity.update({
            where: { id },
            data: { customFields: { ...(activity.customFields as object), calendarSynced: true, calendarSyncedAt: new Date().toISOString() } as any },
          });
          return reply.send({ success: true, data: updated });
        }
      );

      r.post(
        '/meetings/:id/calendar-remove',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const activity = await prisma.activity.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!activity) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          const updated = await prisma.activity.update({
            where: { id },
            data: { customFields: { ...(activity.customFields as object), calendarSynced: false, calendarRemovedAt: new Date().toISOString() } as any },
          });
          return reply.send({ success: true, data: updated });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
