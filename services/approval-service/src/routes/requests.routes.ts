import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { ApprovalPrisma } from '../prisma.js';
import { createPoliciesService } from '../services/policies.service.js';
import { createRequestsService } from '../services/requests.service.js';

const IdSchema = z.object({ id: z.string().cuid() });
const QuerySchema = z.object({
  module: z.string().optional(),
  recordId: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const CreateSchema = z.object({
  policyId: z.string().cuid().optional(),
  module: z.string().min(1),
  recordId: z.string().min(1),
  requestedBy: z.string().min(1).optional(),
  data: z.record(z.unknown()).default({}),
});
const CommentSchema = z.object({ comment: z.string().optional() });
const RejectSchema = z.object({ comment: z.string().min(1) });

export async function registerRequestsRoutes(
  app: FastifyInstance,
  prisma: ApprovalPrisma,
  producer: NexusProducer
) {
  const policies = createPoliciesService(prisma);
  const requests = createRequestsService(prisma, producer);

  app.get(
    '/api/v1/approval/requests',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const q = QuerySchema.parse(request.query);
      const user = request.user as { tenantId: string };
      const data = await requests.listRequests(
        user.tenantId,
        q.module,
        q.recordId,
        q.status,
        q.page,
        q.limit
      );
      return reply.send({ success: true, data });
    }
  );

  app.get(
    '/api/v1/approval/requests/mine',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const q = QuerySchema.parse(request.query);
      const user = request.user as { tenantId: string; sub: string };
      const data = await requests.listMyPendingRequests(
        user.tenantId,
        user.sub,
        q.page,
        q.limit
      );
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/approval/requests',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const body = CreateSchema.parse(request.body);
      const user = request.user as { tenantId: string; sub: string };
      const policyId =
        body.policyId ??
        (await policies.findMatchingPolicy(user.tenantId, body.module, body.data))?.id;
      if (!policyId) {
        return reply.code(404).send({ success: false, error: 'No matching policy' });
      }
      const data = await requests.createRequest(
        user.tenantId,
        policyId,
        body.module,
        body.recordId,
        body.requestedBy ?? user.sub,
        body.data
      );
      if (!data) return reply.code(404).send({ success: false, error: 'Policy not found' });
      return reply.code(201).send({ success: true, data });
    }
  );

  app.get(
    '/api/v1/approval/requests/:id',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const { id } = IdSchema.parse(request.params);
      const user = request.user as { tenantId: string };
      const data = await requests.getRequest(user.tenantId, id);
      if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/approval/requests/:id/approve',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const { id } = IdSchema.parse(request.params);
      const body = CommentSchema.parse(request.body);
      const user = request.user as { tenantId: string; sub: string };
      const data = await requests.approve(user.tenantId, id, user.sub, body.comment);
      if (!data) return reply.code(404).send({ success: false, error: 'Not found or not approver' });
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/approval/requests/:id/reject',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const { id } = IdSchema.parse(request.params);
      const body = RejectSchema.parse(request.body);
      const user = request.user as { tenantId: string; sub: string };
      const data = await requests.reject(user.tenantId, id, user.sub, body.comment);
      if (!data) return reply.code(404).send({ success: false, error: 'Not found or not approver' });
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/approval/requests/:id/cancel',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (request, reply) => {
      const { id } = IdSchema.parse(request.params);
      const user = request.user as { tenantId: string; sub: string; roles?: string[] };
      const data = await requests.cancel(
        user.tenantId,
        id,
        user.sub,
        Array.isArray(user.roles) && user.roles.includes('ADMIN')
      );
      if (!data) return reply.code(404).send({ success: false, error: 'Not found or forbidden' });
      return reply.send({ success: true, data });
    }
  );
}
