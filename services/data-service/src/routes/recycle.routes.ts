import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DataPrisma } from '../prisma.js';
import { createRecycleService } from '../services/recycle.service.js';

const QuerySchema = z.object({
  module: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const IdParams = z.object({ id: z.string().cuid() });

export async function registerRecycleRoutes(app: FastifyInstance, prisma: DataPrisma) {
  const service = createRecycleService(prisma);

  app.get('/api/v1/recycle', async (request, reply) => {
    const q = QuerySchema.parse(request.query);
    const user = request.user as { tenantId: string };
    const data = await service.listBin(user.tenantId, q.module, q.page, q.limit);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/recycle/:id/restore', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = request.user as { tenantId: string };
    const data = await service.restore(user.tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/recycle/:id', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = request.user as { tenantId: string };
    const data = await service.purge(user.tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/recycle/purge-expired', async (_request, reply) => {
    const data = await service.purgeExpired();
    return reply.send({ success: true, data });
  });
}
