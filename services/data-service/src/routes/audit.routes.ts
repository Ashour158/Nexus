import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DataPrisma } from '../prisma.js';
import { createAuditService } from '../services/audit.service.js';

const ParamsSchema = z.object({
  module: z.string().min(1),
  recordId: z.string().min(1),
});

const PageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreateAuditSchema = z.object({
  module: z.string().min(1),
  recordId: z.string().min(1),
  fieldName: z.string().min(1),
  oldValue: z.string().nullish(),
  newValue: z.string().nullish(),
});

export async function registerAuditRoutes(app: FastifyInstance, prisma: DataPrisma) {
  const service = createAuditService(prisma);

  app.get('/api/v1/audit/:module/:recordId', async (request, reply) => {
    const p = ParamsSchema.parse(request.params);
    const q = PageSchema.parse(request.query);
    const user = request.user as { tenantId: string };
    const data = await service.getHistory(
      user.tenantId,
      p.module,
      p.recordId,
      q.page,
      q.limit
    );
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/audit', async (request, reply) => {
    const body = CreateAuditSchema.parse(request.body);
    const user = request.user as { tenantId: string; sub?: string; userId?: string };
    const changedBy = user.userId ?? user.sub ?? 'unknown';
    const data = await service.log(
      user.tenantId,
      body.module,
      body.recordId,
      body.fieldName,
      body.oldValue ?? null,
      body.newValue ?? null,
      changedBy
    );
    return reply.code(201).send({ success: true, data });
  });
}
