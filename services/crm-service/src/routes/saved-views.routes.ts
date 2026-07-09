import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError, NotFoundError } from '@nexus/service-utils';
import { IdParamSchema } from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';

const ListQuerySchema = z.object({
  entityType: z.string().min(1).optional(),
});
const CreateSchema = z.object({
  entityType: z.string().min(1),
  name: z.string().min(1).max(200),
  filters: z.record(z.unknown()).default({}),
  columns: z.array(z.unknown()).optional(),
  isShared: z.boolean().optional(),
});
const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  filters: z.record(z.unknown()).optional(),
  columns: z.array(z.unknown()).nullable().optional(),
  isShared: z.boolean().optional(),
});

/**
 * Registers the saved-views / segmentation route family. A SavedView is a
 * persisted list configuration (filters + columns) owned by a user, optionally
 * shared tenant-wide. Reads return own + shared; writes are owner-scoped.
 *
 * Routes (relative to /api/v1):
 *  - GET    /saved-views?entityType=
 *  - POST   /saved-views
 *  - PATCH  /saved-views/:id
 *  - DELETE /saved-views/:id
 */
export async function registerSavedViewsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/saved-views',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = ListQuerySchema.safeParse(request.query);
          const entityType = parsed.success ? parsed.data.entityType : undefined;
          const jwt = request.user as JwtPayload;
          const data = await prisma.savedView.findMany({
            where: {
              tenantId: jwt.tenantId,
              ...(entityType ? { entityType } : {}),
              OR: [{ ownerId: jwt.sub }, { isShared: true }],
            },
            orderBy: [{ updatedAt: 'desc' }],
          });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/saved-views',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = CreateSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const { entityType, name, filters, columns, isShared } = parsed.data;
          const data = await prisma.savedView.create({
            data: {
              tenantId: jwt.tenantId,
              ownerId: jwt.sub,
              entityType,
              name,
              filters: filters as Prisma.InputJsonValue,
              columns: columns === undefined ? Prisma.JsonNull : (columns as Prisma.InputJsonValue),
              isShared: isShared ?? false,
            },
          });
          return reply.code(201).send({ success: true, data });
        }
      );

      r.patch(
        '/saved-views/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          // Owner-scoped write.
          const existing = await prisma.savedView.findFirst({
            where: { id, tenantId: jwt.tenantId, ownerId: jwt.sub },
            select: { id: true },
          });
          if (!existing) throw new NotFoundError('SavedView', id);

          const update: Prisma.SavedViewUpdateInput = {};
          if (parsed.data.name !== undefined) update.name = parsed.data.name;
          if (parsed.data.filters !== undefined) update.filters = parsed.data.filters as Prisma.InputJsonValue;
          if (parsed.data.columns !== undefined) {
            update.columns = parsed.data.columns === null ? Prisma.JsonNull : (parsed.data.columns as Prisma.InputJsonValue);
          }
          if (parsed.data.isShared !== undefined) update.isShared = parsed.data.isShared;

          const data = await prisma.savedView.update({ where: { id }, data: update });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/saved-views/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          // Owner-scoped delete.
          const result = await prisma.savedView.deleteMany({
            where: { id, tenantId: jwt.tenantId, ownerId: jwt.sub },
          });
          if (result.count === 0) throw new NotFoundError('SavedView', id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
