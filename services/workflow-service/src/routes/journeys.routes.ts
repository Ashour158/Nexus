import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createJourneysService, reconstructRecordPath } from '../services/journeys.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });
const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const RecordPathQuerySchema = z.object({
  module: z.string().min(1).max(50),
  recordId: z.string().min(1).max(100),
});

const CreateJourneySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  entryTrigger: z.string().min(1),
  entryConfig: z.record(z.unknown()).default({}),
  nodes: z.array(z.unknown()).min(1),
  edges: z.array(z.unknown()).default([]),
  settings: z.record(z.unknown()).default({}),
});

const UpdateJourneySchema = CreateJourneySchema.partial();

export async function registerJourneysRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma
): Promise<void> {
  const journeys = createJourneysService(prisma);

  await app.register(
    async (r) => {
      r.get('/journeys', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const parsed = ListQuerySchema.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const result = await journeys.listJourneys(jwt.tenantId, parsed.data.page, parsed.data.limit);
        return reply.send({ success: true, data: result });
      });

      r.post('/journeys', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) }, async (request, reply) => {
        const parsed = CreateJourneySchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const row = await journeys.createJourney(jwt.tenantId, parsed.data);
        return reply.code(201).send({ success: true, data: row });
      });

      // PathFinder — reconstruct the ORDERED path a specific record took through
      // journeys + automation (timeline of {timestamp, stage, action, outcome}).
      // Declared before '/journeys/:id' for readability; Fastify's router still
      // prefers this static path over the parametric one.
      r.get('/journeys/record-path', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const parsed = RecordPathQuerySchema.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const result = await reconstructRecordPath(prisma, jwt.tenantId, parsed.data.module, parsed.data.recordId);
        return reply.send({ success: true, data: result });
      });

      r.get('/journeys/:id', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await journeys.getJourneyOrThrow(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      // PathFinder — journey definition as a node/edge graph + live per-node counts.
      r.get('/journeys/:id/graph', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const graph = await journeys.getJourneyGraph(jwt.tenantId, id);
        return reply.send({ success: true, data: graph });
      });

      r.patch('/journeys/:id', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const parsed = UpdateJourneySchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const row = await journeys.updateJourney(jwt.tenantId, id, parsed.data);
        return reply.send({ success: true, data: row });
      });

      r.post('/journeys/:id/activate', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await journeys.activateJourney(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.post('/journeys/:id/pause', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await journeys.pauseJourney(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.post('/journeys/:id/archive', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        const row = await journeys.archiveJourney(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.delete('/journeys/:id', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.DELETE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const jwt = request.user as JwtPayload;
        await journeys.deleteJourney(jwt.tenantId, id);
        return reply.send({ success: true, data: { deleted: true } });
      });

      // Enrollments
      r.get('/journeys/:id/enrollments', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const parsed = ListQuerySchema.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const result = await journeys.listEnrollments(jwt.tenantId, id, parsed.data.page, parsed.data.limit);
        return reply.send({ success: true, data: result });
      });

      r.post('/journeys/:id/enroll', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.EXECUTE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const body = request.body as { contactId?: string; metadata?: Record<string, unknown> };
        if (!body.contactId) throw new ValidationError('contactId is required');
        const jwt = request.user as JwtPayload;
        const row = await journeys.enrollContact(jwt.tenantId, id, body.contactId, body.metadata);
        return reply.code(201).send({ success: true, data: row });
      });

      r.post('/journeys/:id/exit', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.EXECUTE) }, async (request, reply) => {
        const id = IdParamSchema.parse(request.params).id;
        const body = request.body as { contactId?: string; reason?: string };
        if (!body.contactId) throw new ValidationError('contactId is required');
        const jwt = request.user as JwtPayload;
        await journeys.exitEnrollment(jwt.tenantId, id, body.contactId, body.reason ?? 'MANUAL_EXIT');
        return reply.send({ success: true, data: { exited: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
