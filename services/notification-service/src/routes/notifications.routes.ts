import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NotificationPrisma } from '../prisma.js';
import { createNotificationsService } from '../services/notifications.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  isRead: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  type: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

/**
 * Notification inbox endpoints (Section 34 cross-cutting).
 *
 * Realtime push (WebSocket / SSE) is intentionally not wired here — that lands
 * in a later phase. For now the client polls `GET /notifications/unread-count`
 * or refreshes on navigation.
 */
export async function registerNotificationsRoutes(
  app: FastifyInstance,
  prisma: NotificationPrisma
): Promise<void> {
  const svc = createNotificationsService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/notifications',
        { preHandler: requirePermission(PERMISSIONS.NOTIFICATIONS.READ) },
        async (request, reply) => {
          const parsed = ListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const { page, limit, ...filters } = parsed.data;
          const result = await svc.listNotifications(
            jwt.tenantId,
            jwt.sub,
            filters,
            { page, limit }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/notifications/unread-count',
        { preHandler: requirePermission(PERMISSIONS.NOTIFICATIONS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const count = await svc.getUnreadCount(jwt.tenantId, jwt.sub);
          return reply.send({ success: true, data: { count } });
        }
      );

      r.patch(
        '/notifications/:id/read',
        { preHandler: requirePermission(PERMISSIONS.NOTIFICATIONS.UPDATE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) {
            throw new ValidationError('Invalid id', params.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const row = await svc.markAsRead(
            jwt.tenantId,
            jwt.sub,
            params.data.id
          );
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/notifications/read-all',
        { preHandler: requirePermission(PERMISSIONS.NOTIFICATIONS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const res = await svc.markAllRead(jwt.tenantId, jwt.sub);
          return reply.send({ success: true, data: res });
        }
      );

      r.delete(
        '/notifications/:id',
        { preHandler: requirePermission(PERMISSIONS.NOTIFICATIONS.UPDATE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) {
            throw new ValidationError('Invalid id', params.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          await svc.deleteNotification(jwt.tenantId, jwt.sub, params.data.id);
          return reply.code(204).send();
        }
      );

      // Realtime push (WebSocket / SSE) — planned for a later phase. The
      // payload shape will be:
      //   { event: 'notification', data: <Notification> }
      // and will be broadcast to clients subscribed to `tenantId:userId`.
    },
    { prefix: '/api/v1' }
  );
}
