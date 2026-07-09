import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { DataPrisma } from '../prisma.js';
import { createImportService } from '../services/import.service.js';

const ModuleParams = z.object({ module: z.string().min(1) });
const JobParams = z.object({ id: z.string().cuid() });
const StatusParams = z.object({ jobId: z.string().cuid() });
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
  producer: NexusProducer
) {
  const service = createImportService(prisma, producer);

  app.post('/api/v1/import/:module', { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) }, async (request, reply) => {
    const { module } = ModuleParams.parse(request.params);
    const body = CreateBody.parse(request.body);
    const user = (request as any).user as { tenantId: string; sub?: string; userId?: string };
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

  app.get('/api/v1/import/jobs/:id', { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) }, async (request, reply) => {
    const { id } = JobParams.parse(request.params);
    const user = (request as any).user as { tenantId: string };
    const data = await service.getJob(user.tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/import/jobs', { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) }, async (request, reply) => {
    const q = QuerySchema.parse(request.query);
    const user = (request as any).user as { tenantId: string };
    const data = await service.listJobs(user.tenantId, q.module, q.page, q.limit);
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/imports/:jobId/status', { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) }, async (request, reply) => {
    const { jobId } = StatusParams.parse(request.params);
    const user = (request as any).user as { tenantId: string };

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const sendEvent = (data: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const poll = async (): Promise<void> => {
      try {
        const job = await prisma.importJob.findFirst({
          where: { id: jobId, tenantId: user.tenantId },
        });
        if (!job) {
          sendEvent({ status: 'NOT_FOUND', jobId });
          reply.raw.end();
          return;
        }
        sendEvent({
          status: job.status,
          jobId: job.id,
          totalRows: job.totalRows,
          processedRows: job.imported + job.failed,
          successRows: job.imported,
          errorRows: job.failed,
          errors: job.errors,
          progressPct:
            job.totalRows > 0
              ? Math.round(((job.imported + job.failed) / job.totalRows) * 100)
              : 0,
        });
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          reply.raw.end();
          return;
        }
        setTimeout(() => {
          void poll();
        }, 1000);
      } catch {
        sendEvent({ status: 'ERROR' });
        reply.raw.end();
      }
    };

    request.socket.on('close', () => {
      reply.raw.end();
    });

    await poll();
  });
}
