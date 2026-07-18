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
import { pushCalendarEvent } from '../lib/calendar-client.js';

const CreateMeetingSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  duration: z.number().int().min(0).max(1440).optional(),
  location: z.string().max(500).optional(),
  videoLink: z.string().url().max(2000).optional(),
  recurrence: z.string().max(1000).optional(),
  attendees: z.array(z.string().max(320)).max(500).optional(),
  reminderMinutes: z.number().int().min(0).max(43_200).optional(),
  ownerId: z.string().cuid().optional(),
  dealId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  entityType: z.enum(['QUOTE', 'INVOICE', 'ORDER', 'CONTRACT', 'CAMPAIGN']).optional(),
  entityId: z.string().min(1).max(64).optional(),
  customFields: z.record(z.unknown()).default({}),
});

const CalendarRangeSchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  range: z.enum(['day', 'week', 'month']).optional(),
});

function rangeToWindow(range?: string): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (range === 'day') end.setDate(end.getDate() + 1);
  else if (range === 'month') end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + 7); // default: week
  return { start, end };
}

/**
 * Registers the first-class Meetings module (`/api/v1/meetings`) + calendar.
 * Meetings are an Activity subtype (`type=MEETING`). `/meetings/:id/sync`
 * performs a real 2-way calendar sync via integration-service (Google wired;
 * Microsoft is a documented follow-up).
 */
export async function registerMeetingsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const activities = createActivitiesService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/meetings',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PaginationSchema.parse(request.query);
          const where = { tenantId: jwt.tenantId, type: 'MEETING' as const };
          const [total, rows] = await Promise.all([
            prisma.activity.count({ where }),
            prisma.activity.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { startDate: 'asc' } }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.get(
        '/meetings/upcoming',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const now = new Date();
          const rows = await prisma.activity.findMany({
            where: { tenantId: jwt.tenantId, type: 'MEETING', startDate: { gte: now }, status: { in: ['PLANNED', 'IN_PROGRESS'] as const } },
            orderBy: { startDate: 'asc' },
            take: 50,
          });
          return reply.send({ success: true, data: rows });
        }
      );

      // ─── UNIFIED CALENDAR (tasks + meetings in a date window) ────────────
      r.get(
        '/calendar',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = CalendarRangeSchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const q = parsed.data;
          const win =
            q.start || q.end
              ? {
                  start: q.start ? new Date(q.start) : new Date(0),
                  end: q.end ? new Date(q.end) : new Date('2999-12-31'),
                }
              : rangeToWindow(q.range);
          // Meetings anchor on startDate; tasks anchor on dueDate. Union both.
          const rows = await prisma.activity.findMany({
            where: {
              tenantId: jwt.tenantId,
              type: { in: ['MEETING', 'TASK'] },
              OR: [
                { startDate: { gte: win.start, lte: win.end } },
                { dueDate: { gte: win.start, lte: win.end } },
              ],
            },
            orderBy: { startDate: 'asc' },
            take: 500,
          });
          const events = rows.map((a) => ({
            id: a.id,
            type: a.type,
            title: a.subject,
            start: (a.startDate ?? a.dueDate)?.toISOString() ?? null,
            end: (a.endDate ?? a.dueDate ?? a.startDate)?.toISOString() ?? null,
            status: a.status,
            location: a.location,
            videoLink: a.videoLink,
            attendees: a.attendees,
            externalCalendarEventId: a.externalCalendarEventId,
          }));
          return reply.send({
            success: true,
            data: { start: win.start.toISOString(), end: win.end.toISOString(), events },
          });
        }
      );

      r.get(
        '/meetings/:id',
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
        '/meetings',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.CREATE) },
        async (request, reply) => {
          const parsed = CreateMeetingSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const input: CreateActivityInput = {
            ...parsed.data,
            type: 'MEETING',
            ownerId: parsed.data.ownerId ?? jwt.sub,
          };
          const meeting = await activities.createActivity(jwt.tenantId, input);
          return reply.code(201).send({ success: true, data: meeting });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/meetings/:id',
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
        '/meetings/:id',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await activities.deleteActivity(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ─── REAL 2-WAY CALENDAR SYNC (Google via integration-service) ───────
      r.post(
        '/meetings/:id/sync',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParamSchema.parse(request.params);
          const meeting = await prisma.activity.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!meeting) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Meeting not found', requestId: request.id } });
          }
          const start = meeting.startDate ?? meeting.dueDate;
          if (!start) {
            return reply.code(422).send({ success: false, error: { code: 'MISSING_START', message: 'Meeting has no start/due date to sync', requestId: request.id } });
          }
          const end = meeting.endDate ?? new Date(start.getTime() + (meeting.duration ?? 30) * 60_000);

          try {
            const result = await pushCalendarEvent(
              request.headers.authorization,
              {
                activityId: meeting.id,
                summary: meeting.subject,
                start: start.toISOString(),
                end: end.toISOString(),
              }
            );
            const updated = await prisma.activity.update({
              where: { id },
              data: {
                externalCalendarEventId: result.externalId,
                externalCalendarProvider: result.provider,
              },
            });
            return reply.send({ success: true, data: { meeting: updated, sync: result } });
          } catch (err) {
            request.log.warn({ err }, 'calendar sync failed');
            return reply.code(502).send({ success: false, error: { code: 'CALENDAR_SYNC_FAILED', message: 'External calendar sync failed', requestId: request.id } });
          }
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
