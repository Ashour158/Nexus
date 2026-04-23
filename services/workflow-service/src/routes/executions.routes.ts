import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import type { NexusProducer } from '@nexus/kafka';
import { createExecutionsService } from '../services/executions.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });
const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function registerExecutionsRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<void> {
  const svc = createExecutionsService(prisma, producer);

  await app.register(
    async (r) => {
      r.get('/executions', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const parsed = ListQuerySchema.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const result = await svc.listExecutions(jwt.tenantId, parsed.data.page, parsed.data.limit);
        return reply.send({ success: true, data: result });
      });

      r.get('/executions/:id', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await svc.getExecution(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.get('/executions/:id/log', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const log = await svc.getExecutionLog(jwt.tenantId, id);
        return reply.send({ success: true, data: log });
      });

      r.post('/executions/:id/cancel', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await svc.cancelExecution(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}
