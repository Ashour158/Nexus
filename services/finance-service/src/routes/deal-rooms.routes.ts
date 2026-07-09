import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
} from '@nexus/service-utils';
import { IdParamSchema } from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';

/**
 * Registers the `/api/v1/deal-rooms/*` route family.
 * Migrated from quotes-service (Phase 0 cleanup).
 */
export async function registerDealRoomsRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/deal-rooms',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rooms = await prisma.dealRoom.findMany({
            where: { tenantId: jwt.tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: rooms });
        }
      );

      // ─── READ ───────────────────────────────────────────────────────────
      r.get(
        '/deal-rooms/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const room = await prisma.dealRoom.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
            include: { items: true, documents: true },
          });
          if (!room) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id },
            });
          }
          return reply.send({ success: true, data: room });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
