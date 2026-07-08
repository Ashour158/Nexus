import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { TicketsService } from '../services/tickets.service.js';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const Id = z.object({ id: z.string().min(1) });

const CreateBody = z.object({
  name: z.string().min(1),
  priority: z.enum(PRIORITIES).nullable().optional(),
  firstResponseMins: z.number().int().positive(),
  resolutionMins: z.number().int().positive(),
  businessHoursOnly: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

const PatchBody = CreateBody.partial();

function ctx(request: FastifyRequest) {
  return { tenantId: (request as unknown as { user: { tenantId: string } }).user.tenantId };
}

export async function registerSlaRoutes(app: FastifyInstance, tickets: TicketsService) {
  const R = PERMISSIONS.TICKETS;

  app.get('/api/v1/sla-policies', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    return reply.send({ success: true, data: await tickets.listPolicies(tenantId) });
  });

  // Mutating SLA config is an admin/agent action → gated on UPDATE.
  app.post('/api/v1/sla-policies', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const body = CreateBody.parse(request.body);
    const data = await tickets.createPolicy(tenantId, body);
    return reply.code(201).send({ success: true, data });
  });

  app.patch('/api/v1/sla-policies/:id', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    const body = PatchBody.parse(request.body);
    const data = await tickets.updatePolicy(tenantId, id, body);
    if (!data) {
      return reply
        .code(404)
        .send({ success: false, error: { code: 'NOT_FOUND', message: 'SLA policy not found', requestId: request.id } });
    }
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/sla-policies/:id', { preHandler: requirePermission(R.DELETE) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    const ok = await tickets.deletePolicy(tenantId, id);
    if (!ok) {
      return reply
        .code(404)
        .send({ success: false, error: { code: 'NOT_FOUND', message: 'SLA policy not found', requestId: request.id } });
    }
    return reply.send({ success: true, data: { id, deleted: true } });
  });
}
