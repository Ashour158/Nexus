import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import { IdParamSchema } from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';

const CreateQuotaSchema = z
  .object({
    userId: z.string().min(1).max(64).optional(),
    teamId: z.string().min(1).max(64).optional(),
    territoryId: z.string().min(1).max(64).optional(),
    period: z.string().min(1).max(32), // e.g. "2026-Q3" | "2026-07"
    target: z.number().nonnegative(),
    currency: z.string().length(3).default('USD'),
  })
  .refine((v) => Boolean(v.userId || v.teamId || v.territoryId), {
    message: 'Quota must target a userId, teamId, or territoryId',
  });

const UpdateQuotaSchema = z.object({
  period: z.string().min(1).max(32).optional(),
  target: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
});

const ListQuotaQuerySchema = z.object({
  period: z.string().max(32).optional(),
  userId: z.string().max(64).optional(),
  teamId: z.string().max(64).optional(),
  territoryId: z.string().max(64).optional(),
});

/**
 * Registers Quota CRUD (`/api/v1/quotas`). Quotas are per user/team/territory
 * targets for a named period; `GET /forecast/attainment` compares realized
 * closed-won against them.
 */
export async function registerQuotasRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/quotas',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = ListQuotaQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const q = parsed.data;
          const where: Prisma.QuotaWhereInput = { tenantId: jwt.tenantId };
          if (q.period) where.period = q.period;
          if (q.userId) where.userId = q.userId;
          if (q.teamId) where.teamId = q.teamId;
          if (q.territoryId) where.territoryId = q.territoryId;
          const rows = await prisma.quota.findMany({
            where,
            orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
          });
          return reply.send({
            success: true,
            data: rows.map((row) => ({ ...row, target: Number(row.target) })),
          });
        }
      );

      r.post(
        '/quotas',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateQuotaSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const d = parsed.data;
          const created = await prisma.quota.create({
            data: {
              tenantId: jwt.tenantId,
              userId: d.userId ?? null,
              teamId: d.teamId ?? null,
              territoryId: d.territoryId ?? null,
              period: d.period,
              target: new Prisma.Decimal(d.target),
              currency: d.currency,
            },
          });
          return reply.code(201).send({ success: true, data: { ...created, target: Number(created.target) } });
        }
      );

      r.patch(
        '/quotas/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateQuotaSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const existing = await prisma.quota.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quota not found', requestId: request.id } });
          }
          const data: Prisma.QuotaUpdateInput = {};
          if (parsed.data.period !== undefined) data.period = parsed.data.period;
          if (parsed.data.target !== undefined) data.target = new Prisma.Decimal(parsed.data.target);
          if (parsed.data.currency !== undefined) data.currency = parsed.data.currency;
          const updated = await prisma.quota.update({ where: { id }, data });
          return reply.send({ success: true, data: { ...updated, target: Number(updated.target) } });
        }
      );

      r.delete(
        '/quotas/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const existing = await prisma.quota.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quota not found', requestId: request.id } });
          }
          await prisma.quota.update({ where: { id }, data: { deletedAt: new Date() } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
