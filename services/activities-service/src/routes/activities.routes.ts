import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  ActivityListQuerySchema,
  CompleteActivitySchema,
  CreateActivitySchema,
  IdParamSchema,
  RescheduleActivitySchema,
  UpcomingActivitiesQuerySchema,
  UpdateActivitySchema,
} from '@nexus/validation';
import type { ActivitiesPrisma } from '../prisma.js';
import { createActivitiesService } from '../services/activities.service.js';
import type { NexusProducer } from '@nexus/kafka';

export async function registerActivitiesRoutes(
  app: FastifyInstance,
  prisma: ActivitiesPrisma,
  producer: NexusProducer
): Promise<void> {
  const activities = createActivitiesService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/activities',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const parsed = ActivityListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await activities.listActivities(jwt.tenantId, { dealId: q.dealId, contactId: q.contactId, leadId: q.leadId, accountId: q.accountId, ownerId: q.ownerId, type: q.type, status: q.status, dueBefore: q.dueBefore, dueAfter: q.dueAfter, overdue: q.overdue }, { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir });
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/activities',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.CREATE) },
        async (request, reply) => {
          const parsed = CreateActivitySchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const activity = await activities.createActivity(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: activity });
        }
      );

      r.get(
        '/activities/upcoming',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const parsed = UpcomingActivitiesQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await activities.getUpcomingActivities(jwt.tenantId, parsed.data.ownerId, parsed.data.daysAhead);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/activities/:id',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await activities.getActivityById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/activities/:id',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateActivitySchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await activities.updateActivity(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/activities/:id',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await activities.deleteActivity(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      r.post(
        '/activities/:id/complete',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = CompleteActivitySchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await activities.completeActivity(jwt.tenantId, id, parsed.data.outcome);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/activities/:id/reschedule',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = RescheduleActivitySchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await activities.rescheduleActivity(jwt.tenantId, id, parsed.data.dueDate);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
