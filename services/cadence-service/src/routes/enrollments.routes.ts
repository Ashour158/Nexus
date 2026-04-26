import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createEnrollmentsService } from '../services/enrollments.service.js';

const ListQuery = z.object({
  cadenceId: z.string().cuid().optional(),
  objectId: z.string().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'EXITED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const Create = z.object({
  cadenceId: z.string().cuid(),
  objectType: z.enum(['CONTACT', 'LEAD']),
  objectId: z.string().min(1),
  ownerId: z.string().cuid(),
});
const ExitBody = z.object({ reason: z.string().min(1) });
const Id = z.object({ id: z.string().cuid() });

export async function registerEnrollmentsRoutes(
  app: FastifyInstance,
  enrollments: ReturnType<typeof createEnrollmentsService>
) {
  app.get('/api/v1/enrollments', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const q = ListQuery.parse(request.query);
    const data = await enrollments.listEnrollments(
      tenantId,
      q.cadenceId,
      q.objectId,
      q.status,
      q.page,
      q.limit
    );
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/enrollments', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = Create.parse(request.body);
    const data = await enrollments.enroll(
      tenantId,
      body.cadenceId,
      body.objectType,
      body.objectId,
      body.ownerId
    );
    return reply.code(201).send({ success: true, data });
  });

  app.post('/api/v1/enrollments/:id/pause', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await enrollments.pauseEnrollment(tenantId, id);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/enrollments/:id/resume', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await enrollments.resumeEnrollment(tenantId, id);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/enrollments/:id/exit', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const body = ExitBody.parse(request.body);
    const data = await enrollments.exitEnrollment(tenantId, id, body.reason);
    return reply.send({ success: true, data });
  });
}
