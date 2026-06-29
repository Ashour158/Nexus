import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { DataPrisma } from '../prisma.js';
import { createRecycleService } from '../services/recycle.service.js';

const QuerySchema = z.object({
  module: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const IdParams = z.object({ id: z.string().cuid() });

const CreateRecycleItemSchema = z.object({
  module: z.string().min(1),
  recordId: z.string().cuid(),
  recordSnapshot: z.record(z.unknown()),
  deletedBy: z.string().min(1),
});

export async function registerRecycleRoutes(app: FastifyInstance, prisma: DataPrisma) {
  const service = createRecycleService(prisma);

  app.post('/api/v1/recycle', { preHandler: requirePermission(PERMISSIONS.DATA.READ) }, async (request, reply) => {
    const body = CreateRecycleItemSchema.parse(request.body);
    const user = (request as any).user as { tenantId: string };
    const item = await service.softDelete(user.tenantId, body.module, body.recordId, body.recordSnapshot, body.deletedBy);
    return reply.code(201).send({ success: true, data: item });
  });

  app.get('/api/v1/recycle', { preHandler: requirePermission(PERMISSIONS.DATA.READ) }, async (request, reply) => {
    const q = QuerySchema.parse(request.query);
    const user = (request as any).user as { tenantId: string };
    const data = await service.listBin(user.tenantId, q.module, q.page, q.limit);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/recycle/:id/restore', { preHandler: requirePermission(PERMISSIONS.DATA.READ) }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = (request as any).user as { tenantId: string };
    const data = await service.restore(user.tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/recycle/:id', { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = (request as any).user as { tenantId: string };
    const data = await service.purge(user.tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/recycle/purge-expired', { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) }, async (_request, reply) => {
    const data = await service.purgeExpired();
    return reply.send({ success: true, data });
  });
}
