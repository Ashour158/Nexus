import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { NotFoundError, PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { IdParamSchema, PaginationSchema } from '@nexus/validation';
import type { AuthPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

/**
 * Registers `/api/v1/audit-logs/*` routes (Section 34.1).
 */
export async function registerAuditLogsRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/audit-logs',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const where = { tenantId: jwt.tenantId };
          const [total, rows] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({
              where,
              skip: (q.page - 1) * q.limit,
              take: q.limit,
              orderBy: { createdAt: q.sortDir === 'asc' ? 'asc' : 'desc' },
            }),
          ]);
          return reply.send({
            success: true,
            data: toPaginatedResult(rows, total, q.page, q.limit),
          });
        }
      );

      r.get(
        '/audit-logs/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const row = await prisma.auditLog.findUnique({ where: { id } });
          if (!row) throw new NotFoundError('AuditLog', id);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
