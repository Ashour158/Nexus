import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  IdParamSchema,
  PaginationSchema,
  UpdateActivitySchema,
  type CreateActivityInput,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createActivitiesService } from '../services/activities.service.js';

const CreateTaskSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  dueDate: z.string().datetime().optional(),
  reminderMinutes: z.number().int().min(0).max(43_200).optional(),
  recurrence: z.string().max(1000).optional(),
  ownerId: z.string().cuid().optional(),
  dealId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  entityType: z.enum(['QUOTE', 'INVOICE', 'ORDER', 'CONTRACT', 'CAMPAIGN']).optional(),
  entityId: z.string().min(1).max(64).optional(),
  customFields: z.record(z.unknown()).default({}),
});

/**
 * Registers the first-class Tasks module (`/api/v1/tasks`). Tasks are an
 * Activity subtype (`type=TASK`); GET projections + full create/update/delete.
 */
export async function registerTasksRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const activities = createActivitiesService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/tasks',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const where = { tenantId: jwt.tenantId, type: 'TASK' as const };
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where }),
            prisma.activity.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { dueDate: 'asc' } }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.get(
        '/tasks/overdue',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const where: any = { tenantId: jwt.tenantId, type: 'TASK', dueDate: { lt: new Date() }, status: { in: ['PLANNED', 'IN_PROGRESS'] } };
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where }),
            prisma.activity.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { dueDate: 'asc' } }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.get(
        '/tasks/due-today',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const end = new Date(); end.setHours(23, 59, 59, 999);
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where: { tenantId: jwt.tenantId, type: 'TASK', dueDate: { gte: start, lte: end } } }),
            prisma.activity.findMany({
              where: { tenantId: jwt.tenantId, type: 'TASK', dueDate: { gte: start, lte: end } },
              orderBy: { dueDate: 'asc' },
              skip: (q.page - 1) * q.limit,
              take: q.limit,
            }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.get(
        '/tasks/:id',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await activities.getActivityById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      // ─── CREATE ─────────────────────────────────────────────────────────
      r.post(
        '/tasks',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.CREATE) },
        async (request, reply) => {
          const parsed = CreateTaskSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const input: CreateActivityInput = {
            ...parsed.data,
            type: 'TASK',
            ownerId: parsed.data.ownerId ?? jwt.sub,
          };
          const task = await activities.createActivity(jwt.tenantId, input);
          return reply.code(201).send({ success: true, data: task });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/tasks/:id',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateActivitySchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const row = await activities.updateActivity(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      // ─── DELETE (soft) ──────────────────────────────────────────────────
      r.delete(
        '/tasks/:id',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await activities.deleteActivity(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
