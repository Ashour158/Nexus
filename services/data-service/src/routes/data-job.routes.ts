import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { DataPrisma } from '../prisma.js';
import { createDataJobService } from '../services/data-job.service.js';

const IdParams = z.object({ id: z.string().cuid() });
const QuerySchema = z.object({
  kind: z.enum(['IMPORT', 'EXPORT']).optional(),
  module: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const RunsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const ConfigSchema = z.record(z.unknown());

const CreateBody = z.object({
  name: z.string().min(1),
  kind: z.enum(['IMPORT', 'EXPORT']),
  module: z.string().min(1),
  config: ConfigSchema.default({}),
  cron: z.string().min(1),
  isActive: z.boolean().optional(),
});

const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  kind: z.enum(['IMPORT', 'EXPORT']).optional(),
  module: z.string().min(1).optional(),
  config: ConfigSchema.optional(),
  cron: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function registerDataJobRoutes(
  app: FastifyInstance,
  prisma: DataPrisma,
  producer?: NexusProducer
) {
  const service = createDataJobService(prisma, producer);

  app.post('/api/v1/data-jobs', { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) }, async (request, reply) => {
    const body = CreateBody.parse(request.body);
    const user = (request as any).user as { tenantId: string; sub?: string; userId?: string };
    const createdBy = user.userId ?? user.sub ?? 'system';
    const job = await service.create(user.tenantId, createdBy, body as any);
    return reply.code(201).send({ success: true, data: job });
  });

  app.get('/api/v1/data-jobs', { preHandler: requirePermission(PERMISSIONS.DATA.READ) }, async (request, reply) => {
    const q = QuerySchema.parse(request.query);
    const user = (request as any).user as { tenantId: string };
    const data = await service.list(user.tenantId, { kind: q.kind, module: q.module, page: q.page, limit: q.limit });
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/data-jobs/:id', { preHandler: requirePermission(PERMISSIONS.DATA.READ) }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = (request as any).user as { tenantId: string };
    const job = await service.get(user.tenantId, id);
    if (!job)
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data: job });
  });

  app.patch('/api/v1/data-jobs/:id', { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const body = UpdateBody.parse(request.body);
    const user = (request as any).user as { tenantId: string };
    const job = await service.update(user.tenantId, id, body as any);
    if (!job)
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data: job });
  });

  app.delete('/api/v1/data-jobs/:id', { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = (request as any).user as { tenantId: string };
    const job = await service.remove(user.tenantId, id);
    if (!job)
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data: job });
  });

  // Execution history for a job.
  app.get('/api/v1/data-jobs/:id/runs', { preHandler: requirePermission(PERMISSIONS.DATA.READ) }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const q = RunsQuery.parse(request.query);
    const user = (request as any).user as { tenantId: string };
    const job = await service.get(user.tenantId, id);
    if (!job)
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    const data = await service.listRuns(user.tenantId, id, q.page, q.limit);
    return reply.send({ success: true, data });
  });

  // Manual "run now" — runs the job immediately and records a DataJobRun.
  app.post('/api/v1/data-jobs/:id/run', { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const user = (request as any).user as { tenantId: string };
    const result = await service.runNow(user.tenantId, id, request.headers.authorization);
    if (!result)
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data: result });
  });
}
