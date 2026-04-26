import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ApprovalPrisma } from '../prisma.js';
import { createPoliciesService } from '../services/policies.service.js';

const QuerySchema = z.object({ module: z.string().optional() });
const IdSchema = z.object({ id: z.string().cuid() });
const PolicySchema = z.object({
  name: z.string().min(1),
  module: z.string().min(1),
  conditions: z.record(z.unknown()).optional(),
  steps: z.array(z.record(z.unknown())).optional(),
  isActive: z.boolean().optional(),
});

export async function registerPoliciesRoutes(app: FastifyInstance, prisma: ApprovalPrisma) {
  const service = createPoliciesService(prisma);

  app.get(
    '/api/v1/approval/policies',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const q = QuerySchema.parse(request.query);
      const user = request.user as { tenantId: string };
      const data = await service.listPolicies(user.tenantId, q.module);
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/approval/policies',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const body = PolicySchema.parse(request.body);
      const user = request.user as { tenantId: string };
      const data = await service.createPolicy(user.tenantId, body);
      return reply.code(201).send({ success: true, data });
    }
  );

  app.patch(
    '/api/v1/approval/policies/:id',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const { id } = IdSchema.parse(request.params);
      const body = PolicySchema.partial().parse(request.body);
      const user = request.user as { tenantId: string };
      const data = await service.updatePolicy(user.tenantId, id, body);
      if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
      return reply.send({ success: true, data });
    }
  );

  app.delete(
    '/api/v1/approval/policies/:id',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const { id } = IdSchema.parse(request.params);
      const user = request.user as { tenantId: string };
      const data = await service.deletePolicy(user.tenantId, id);
      if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
      return reply.send({ success: true, data });
    }
  );
}
