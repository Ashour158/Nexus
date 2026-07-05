import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';

/**
 * Levels (seniority / grade) routes — CRM system-control layer. Ordered by
 * `rank`, tenant-scoped, guarded by SETTINGS.READ / SETTINGS.UPDATE.
 */
export async function registerLevelsRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  const IdParam = z.object({ id: z.string().min(1) });

  const CreateSchema = z
    .object({
      name: z.string().min(1).max(120),
      rank: z.number().int(),
      description: z.string().max(2000).nullish(),
    })
    .strict();

  const UpdateSchema = CreateSchema.partial();

  await app.register(
    async (r) => {
      // GET /api/v1/levels — ordered by rank ascending.
      r.get(
        '/levels',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const levels = await (prisma as any).level.findMany({
            where: { tenantId: jwt.tenantId },
            orderBy: [{ rank: 'asc' }],
          });
          return reply.send({ success: true, data: levels });
        }
      );

      // POST /api/v1/levels
      r.post(
        '/levels',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const body = CreateSchema.parse(req.body);
          try {
            const level = await (prisma as any).level.create({ data: body });
            await (prisma as any).auditLog.create({
              data: {
                tenantId: jwt.tenantId,
                userId: jwt.sub,
                action: 'CREATE',
                resource: 'Level',
                resourceId: level.id,
                newValue: body as object,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
              },
            });
            return reply.code(201).send({ success: true, data: level });
          } catch (err: any) {
            if (err?.code === 'P2002') {
              return reply.code(409).send({
                success: false,
                error: { code: 'CONFLICT', message: 'A level with this name or rank already exists', requestId: req.id },
              });
            }
            throw err;
          }
        }
      );

      // PATCH /api/v1/levels/:id
      r.patch(
        '/levels/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const { id } = IdParam.parse(req.params);
          const body = UpdateSchema.parse(req.body);

          const existing = await (prisma as any).level.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!existing) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Level not found', requestId: req.id },
            });
          }

          try {
            const level = await (prisma as any).level.update({
              where: { id_tenantId: { id, tenantId: jwt.tenantId } },
              data: body,
            });
            await (prisma as any).auditLog.create({
              data: {
                tenantId: jwt.tenantId,
                userId: jwt.sub,
                action: 'UPDATE',
                resource: 'Level',
                resourceId: id,
                newValue: body as object,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
              },
            });
            return reply.send({ success: true, data: level });
          } catch (err: any) {
            if (err?.code === 'P2002') {
              return reply.code(409).send({
                success: false,
                error: { code: 'CONFLICT', message: 'A level with this name or rank already exists', requestId: req.id },
              });
            }
            throw err;
          }
        }
      );

      // DELETE /api/v1/levels/:id — blocked when members are assigned.
      r.delete(
        '/levels/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const { id } = IdParam.parse(req.params);

          const existing = await (prisma as any).level.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!existing) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Level not found', requestId: req.id },
            });
          }

          const memberCount = await (prisma as any).userProfile.count({
            where: { levelId: id, tenantId: jwt.tenantId },
          });
          if (memberCount > 0) {
            return reply.code(409).send({
              success: false,
              error: {
                code: 'CONFLICT',
                message: `Cannot delete: level has ${memberCount} member(s). Reassign them first.`,
                requestId: req.id,
              },
            });
          }

          await (prisma as any).level.delete({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
          });
          await (prisma as any).auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'DELETE',
              resource: 'Level',
              resourceId: id,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
