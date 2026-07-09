/**
 * CommandCenter journey routes — mounted under /api/v1/command-center to stay
 * clear of the existing marketing /journeys namespace. Permission-guarded with
 * the WORKFLOWS scopes and tenant-scoped via the JWT tenantId.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { NexusProducer } from '@nexus/kafka';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createCommandJourneysService, ENTITY_TYPES } from '../services/command-journeys.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });
const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  entityType: z.enum(ENTITY_TYPES),
  entryTrigger: z.record(z.unknown()).default({}),
  steps: z.array(z.unknown()).default([]),
  exitCriteria: z.record(z.unknown()).nullable().optional(),
});

const UpdateSchema = CreateSchema.partial().extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

const EnrollSchema = z.object({
  entityType: z.enum(ENTITY_TYPES).optional(),
  entityId: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});

export async function registerCommandJourneysRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<void> {
  const journeys = createCommandJourneysService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/journeys',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const parsed = ListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const result = await journeys.listJourneys(jwt.tenantId, parsed.data.page, parsed.data.limit);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/journeys',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) },
        async (request, reply) => {
          const parsed = CreateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await journeys.createJourney(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/journeys/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await journeys.getJourneyOrThrow(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/journeys/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = UpdateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await journeys.updateJourney(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/journeys/:id/activate',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await journeys.activateJourney(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/journeys/:id/archive',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await journeys.archiveJourney(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/journeys/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.DELETE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          await journeys.deleteJourney(jwt.tenantId, id);
          return reply.send({ success: true, data: { deleted: true } });
        }
      );

      // ── Enrollments ──────────────────────────────────────────────────────
      r.get(
        '/journeys/:id/enrollments',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = ListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const result = await journeys.listEnrollments(jwt.tenantId, id, parsed.data.page, parsed.data.limit);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/journeys/:id/enroll',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.EXECUTE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = EnrollSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const journey = await journeys.getJourneyOrThrow(jwt.tenantId, id);
          const row = await journeys.enroll(
            jwt.tenantId,
            id,
            parsed.data.entityType ?? journey.entityType,
            parsed.data.entityId,
            parsed.data.context
          );
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.post(
        '/journeys/:id/exit',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.EXECUTE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const body = request.body as { entityId?: string; reason?: string };
          if (!body.entityId) throw new ValidationError('entityId is required');
          const jwt = request.user as JwtPayload;
          await journeys.exitEnrollment(jwt.tenantId, id, body.entityId, body.reason ?? 'MANUAL_EXIT');
          return reply.send({ success: true, data: { exited: true } });
        }
      );
    },
    { prefix: '/api/v1/command-center' }
  );
}
