import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';

export async function registerWinLossRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/win-loss-reasons',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { type } = request.query as { type?: string };
          const reasons = await prisma.winLossReason.findMany({
            where: { tenantId: jwt.tenantId, isActive: true, ...(type ? { type } : {}) },
            orderBy: { position: 'asc' },
          });
          return reply.send({ success: true, data: reasons });
        }
      );

      r.post(
        '/win-loss-reasons',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const Body = z.object({
            type: z.enum(['won', 'lost']),
            reason: z.string().min(1).max(500),
            pipelineId: z.string().cuid().optional(),
            position: z.number().int().optional(),
          });
          const parsed = Body.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', requestId: request.id } });
          }
          const body = parsed.data;
          const reason = await prisma.winLossReason.create({
            data: {
              tenantId: jwt.tenantId,
              type: body.type,
              reason: body.reason,
              pipelineId: body.pipelineId,
              position: body.position ?? 0,
            },
          });
          return reply.code(201).send({ success: true, data: reason });
        }
      );

      r.patch(
        '/win-loss-reasons/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const Body = z.object({
            reason: z.string().min(1).max(500).optional(),
            type: z.enum(['won', 'lost']).optional(),
            pipelineId: z.string().cuid().nullable().optional(),
            position: z.number().int().optional(),
            isActive: z.boolean().optional(),
          });
          const parsed = Body.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', requestId: request.id } });
          }
          const row = await prisma.winLossReason.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!row) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          const data = parsed.data;
          const updated = await prisma.winLossReason.update({
            where: { id },
            data: {
              ...(data.reason !== undefined ? { reason: data.reason } : {}),
              ...(data.type !== undefined ? { type: data.type } : {}),
              ...(data.pipelineId !== undefined ? { pipelineId: data.pipelineId } : {}),
              ...(data.position !== undefined ? { position: data.position } : {}),
              ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            },
          });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/win-loss-reasons/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const row = await prisma.winLossReason.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!row) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          await prisma.winLossReason.update({
            where: { id },
            data: { isActive: false },
          });
          return reply.send({ success: true });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
