import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DataPrisma } from '../prisma.js';
import { createViewsService } from '../services/views.service.js';

const ModuleParams = z.object({ module: z.string().min(1) });
const IdParams = z.object({ id: z.string().cuid() });

const CreateViewSchema = z.object({
  name: z.string().min(1).max(120),
  filters: z.record(z.unknown()).optional(),
  columns: z.array(z.string()).optional(),
  sortBy: z.string().nullable().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  isDefault: z.boolean().optional(),
});

const UpdateViewSchema = CreateViewSchema.partial();

export async function registerViewsRoutes(app: FastifyInstance, prisma: DataPrisma) {
  const service = createViewsService(prisma);

  app.get('/api/v1/views/:module', async (request, reply) => {
    const { module } = ModuleParams.parse(request.params);
    const user = request.user as { tenantId: string; sub?: string; userId?: string };
    const userId = user.userId ?? user.sub ?? '';
    const data = await service.listViews(user.tenantId, userId, module);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/views/:module', async (request, reply) => {
    const { module } = ModuleParams.parse(request.params);
    const body = CreateViewSchema.parse(request.body);
    const user = request.user as { tenantId: string; sub?: string; userId?: string };
    const userId = user.userId ?? user.sub ?? '';
    const data = await service.createView(user.tenantId, userId, module, body);
    return reply.code(201).send({ success: true, data });
  });

  app.patch('/api/v1/views/:id', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const body = UpdateViewSchema.parse(request.body);
    const user = request.user as { tenantId: string };
    const data = await service.updateView(user.tenantId, id, body);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/views/:id', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = request.user as { tenantId: string };
    const data = await service.deleteView(user.tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });
}
