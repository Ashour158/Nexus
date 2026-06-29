import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createSlaService } from '../services/sla.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });
const CreateSlaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entityType: z.string().min(1),
  stageId: z.string().optional(),
  condition: z.record(z.unknown()).optional(),
  timeLimitHours: z.number().int().min(1).optional(),
  businessHoursOnly: z.boolean().optional(),
});

export async function registerSlaRoutes(app: FastifyInstance, prisma: WorkflowPrisma): Promise<void> {
  const sla = createSlaService(prisma);

  await app.register(
    async (r) => {
      r.get('/sla/definitions', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await sla.listDefinitions(jwt.tenantId);
        return reply.send({ success: true, data: rows });
      });

      r.post('/sla/definitions', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const parsed = CreateSlaSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const row = await sla.createDefinition(jwt.tenantId, parsed.data);
        return reply.code(201).send({ success: true, data: row });
      });

      r.get('/sla/check', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const q = z.object({
          entityType: z.string(),
          entityId: z.string(),
          slaId: z.string().optional(),
        }).parse(request.query);
        const result = await sla.checkSla(jwt.tenantId, q.entityType, q.entityId, q.slaId);
        return reply.send({ success: true, data: result });
      });

      r.get('/sla/breaches', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const status = (request.query as { status?: string }).status;
        const rows = await sla.listBreaches(jwt.tenantId, status);
        return reply.send({ success: true, data: rows });
      });

      r.post('/sla/breaches/:id/escalate', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await sla.escalateBreach(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.post('/sla/breaches/:id/resolve', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await sla.resolveBreach(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}
