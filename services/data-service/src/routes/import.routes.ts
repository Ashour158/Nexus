import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { NexusProducer } from '@nexus/kafka';
import type { DataPrisma } from '../prisma.js';
import { createImportService } from '../services/import.service.js';

const ModuleParams = z.object({ module: z.string().min(1) });
const JobParams = z.object({ id: z.string().cuid() });
const QuerySchema = z.object({
  module: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const CreateBody = z.object({
  fileName: z.string().min(1),
  csvBase64: z.string().min(1),
  fieldMap: z.record(z.string()),
});

export async function registerImportRoutes(
  app: FastifyInstance,
  prisma: DataPrisma,
  _producer: NexusProducer
) {
  const service = createImportService(prisma);

  app.post('/api/v1/import/:module', async (request, reply) => {
    const { module } = ModuleParams.parse(request.params);
    const body = CreateBody.parse(request.body);
    const user = request.user as { tenantId: string; sub?: string; userId?: string };
    const createdBy = user.userId ?? user.sub ?? 'system';
    const job = await service.createJob(
      user.tenantId,
      module,
      body.fileName,
      createdBy,
      body.fieldMap
    );
    const buffer = Buffer.from(body.csvBase64, 'base64');
    void service.processJob(job.id, buffer);
    return reply.code(202).send({ success: true, data: job });
  });

  app.get('/api/v1/import/jobs/:id', async (request, reply) => {
    const { id } = JobParams.parse(request.params);
    const user = request.user as { tenantId: string };
    const data = await service.getJob(user.tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/import/jobs', async (request, reply) => {
    const q = QuerySchema.parse(request.query);
    const user = request.user as { tenantId: string };
    const data = await service.listJobs(user.tenantId, q.module, q.page, q.limit);
    return reply.send({ success: true, data });
  });
}
