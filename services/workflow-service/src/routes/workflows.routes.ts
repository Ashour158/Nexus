import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createWorkflowsService } from '../services/workflows.service.js';
import { createExecutionsService } from '../services/executions.service.js';
import type { NexusProducer } from '@nexus/kafka';

const IdParamSchema = z.object({ id: z.string().cuid() });
const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  trigger: z.string().min(1).max(100),
  triggerConditions: z.record(z.unknown()).default({}),
  nodes: z.array(z.unknown()).min(1),
  edges: z.array(z.unknown()).default([]),
});
const UpdateWorkflowSchema = CreateWorkflowSchema.partial();
const TestRunSchema = z.object({ payload: z.record(z.unknown()).default({}) });

export async function registerWorkflowsRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<void> {
  const workflows = createWorkflowsService(prisma);
  const executions = createExecutionsService(prisma, producer);

  await app.register(
    async (r) => {
      r.get('/workflows', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const parsed = ListQuerySchema.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const result = await workflows.listWorkflows(jwt.tenantId, parsed.data.page, parsed.data.limit);
        return reply.send({ success: true, data: result });
      });

      r.post('/workflows', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) }, async (request, reply) => {
        const parsed = CreateWorkflowSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const row = await workflows.createWorkflow(jwt.tenantId, parsed.data);
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/workflows/:id', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const parsed = UpdateWorkflowSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const row = await workflows.updateWorkflow(jwt.tenantId, id, parsed.data);
        return reply.send({ success: true, data: row });
      });

      r.post('/workflows/:id/activate', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await workflows.activateWorkflow(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.post('/workflows/:id/deactivate', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await workflows.deactivateWorkflow(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.post('/workflows/:id/test-run', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.EXECUTE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const parsed = TestRunSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const execution = await executions.createExecution(jwt.tenantId, id, 'TEST_RUN', parsed.data.payload);
        await executions.runExecution(execution.id);
        const latest = await executions.getExecution(jwt.tenantId, execution.id);
        return reply.send({ success: true, data: latest });
      });
    },
    { prefix: '/api/v1' }
  );
}
