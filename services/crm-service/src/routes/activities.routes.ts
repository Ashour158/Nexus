import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
  createHttpClient,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  ActivityListQuerySchema,
  CompleteActivitySchema,
  CreateActivitySchema,
  IdParamSchema,
  PaginationSchema,
  RescheduleActivitySchema,
  UpdateActivitySchema,
  UpcomingActivitiesQuerySchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createActivitiesService } from '../services/activities.service.js';

const DealParamsSchema = z.object({ dealId: z.string().cuid() });
const ContactParamsSchema = z.object({ contactId: z.string().cuid() });
const LeadParamsSchema = z.object({ leadId: z.string().cuid() });
const PublicMeetingSchema = z.object({
  bookingToken: z.string().min(1),
  subject: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  duration: z.number().int().positive().default(30),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
});

const authClient = createHttpClient({
  baseURL: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000',
});

/**
 * Registers the `/api/v1/activities/*` route family (Section 34.3).
 * Cross-entity feeds (`/deals/:dealId/activities` etc.) live here so the
 * handlers can share a single `activities` service instance.
 */
export async function registerActivitiesRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const activities = createActivitiesService(prisma, producer);

  await app.register(
    async (r) => {
      // ─── LIST ─────────────────────────────────────────────────────────
      r.get(
        '/activities',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const parsed = ActivityListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await activities.listActivities(jwt.tenantId, {
            dealId: q.dealId,
            contactId: q.contactId,
            leadId: q.leadId,
            accountId: q.accountId,
            entityType: q.entityType,
            entityId: q.entityId,
            ownerId: q.ownerId,
            type: q.type,
            status: q.status,
            dueBefore: q.dueBefore,
            dueAfter: q.dueAfter,
            overdue: q.overdue,
          }, {
            page: q.page,
            limit: q.limit,
            sortBy: q.sortBy as import('../services/activities.service.js').ActivityListPagination['sortBy'],
            sortDir: q.sortDir,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── CREATE ─────────────────────────────────────────────────────────
      r.post(
        '/activities/public-meeting',
        async (request, reply) => {
          const body = PublicMeetingSchema.parse(request.body);
          const tokenRes = await authClient.get<{ success: boolean; data?: { id: string; tenantId: string } }>(
            `/api/v1/users/by-booking-token/${encodeURIComponent(body.bookingToken)}`
          );
          if (!tokenRes.success || !tokenRes.data) {
            return reply.code(401).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired booking token', requestId: request.id } });
          }
          const activity = await activities.createActivity(tokenRes.data.tenantId, {
            ownerId: tokenRes.data.id,
            type: 'MEETING',
            subject: body.subject,
            description: body.description,
            priority: 'NORMAL',
            dueDate: body.dueDate,
            startDate: body.startDate,
            endDate: body.endDate,
            duration: body.duration,
            customFields: {
              customerName: body.customerName,
              customerEmail: body.customerEmail,
              source: 'public_scheduler',
            },
          });
          return reply.code(201).send({ success: true, data: activity });
        }
      );

      r.post(
        '/activities',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.CREATE) },
        async (request, reply) => {
          const parsed = CreateActivitySchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const activity = await activities.createActivity(
            jwt.tenantId,
            parsed.data
          );
          return reply.code(201).send({ success: true, data: activity });
        }
      );

      r.post('/activities/call', { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const body = request.body as {
          contactId?: string;
          leadId?: string;
          accountId?: string;
          dealId?: string;
          direction: 'INBOUND' | 'OUTBOUND';
          durationSeconds?: number;
          outcome?: string;
          recordingUrl?: string;
          notes?: string;
        };
        const activity = await prisma.activity.create({
          data: {
            tenantId: jwt.tenantId,
            ownerId: jwt.sub,
            type: 'CALL',
            contactId: body.contactId,
            leadId: body.leadId,
            accountId: body.accountId,
            dealId: body.dealId,
            subject: `${body.direction === 'INBOUND' ? 'Incoming' : 'Outgoing'} call`,
            description: body.notes,
            customFields: {
              direction: body.direction,
              durationSeconds: body.durationSeconds,
              outcome: body.outcome || 'CONNECTED',
              recordingUrl: body.recordingUrl,
            },
          },
        });
        return reply.code(201).send({ success: true, data: activity });
      });

      r.get('/activities/calls', { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const {
          contactId,
          leadId,
          accountId,
          dealId,
          limit = '50',
          offset = '0',
        } = request.query as Record<string, string>;
        const take = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
        const skip = Math.max(0, Number.parseInt(offset, 10) || 0);
        const where: Record<string, unknown> = { tenantId: jwt.tenantId, type: 'CALL' };
        if (contactId) where.contactId = contactId;
        if (leadId) where.leadId = leadId;
        if (accountId) where.accountId = accountId;
        if (dealId) where.dealId = dealId;
        const [calls, total] = await Promise.all([
          prisma.activity.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take,
            skip,
          }),
          prisma.activity.count({ where }),
        ]);
        return reply.send({ success: true, data: { rows: calls, total } });
      });

      // ─── UPCOMING ─────────────────────────────────────────────────────
      r.get(
        '/activities/upcoming',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const parsed = UpcomingActivitiesQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const rows = await activities.getUpcomingActivities(jwt.tenantId, parsed.data.ownerId, parsed.data.daysAhead);
          return reply.send({ success: true, data: rows });
        }
      );

      // ─── READ ─────────────────────────────────────────────────────────
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

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/activities/:id',
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
        '/activities/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const activity = await activities.restoreActivity(jwt.tenantId, id);
          return reply.send({ success: true, data: activity });
        }
      );

      // ─── COMPLETE ───────────────────────────────────────────────────────
      r.post(
        '/activities/:id/complete',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = CompleteActivitySchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const row = await activities.completeActivity(
            jwt.tenantId,
            id,
            parsed.data.outcome
          );
          return reply.send({ success: true, data: row });
        }
      );

      // ─── RESCHEDULE ─────────────────────────────────────────────────────
      r.patch(
        '/activities/:id/reschedule',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = RescheduleActivitySchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const row = await activities.rescheduleActivity(
            jwt.tenantId,
            id,
            parsed.data.dueDate
          );
          return reply.send({ success: true, data: row });
        }
      );

      // ─── ACTIVITIES FOR DEAL ──────────────────────────────────────────
      r.get(
        '/deals/:dealId/activities',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const { dealId } = DealParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await activities.listActivitiesForDeal(jwt.tenantId, dealId, {
            page: q.page,
            limit: q.limit,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── ACTIVITIES FOR CONTACT ───────────────────────────────────────
      r.get(
        '/contacts/:contactId/activities',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const { contactId } = ContactParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await activities.listActivitiesForContact(jwt.tenantId, contactId, {
            page: q.page,
            limit: q.limit,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── ACTIVITIES FOR LEAD (local) ────────────────────────────────────
      r.get(
        '/leads/:leadId/activities',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const { leadId } = LeadParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await activities.listActivitiesForLead(
            jwt.tenantId,
            leadId,
            { page: q.page, limit: q.limit }
          );
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
