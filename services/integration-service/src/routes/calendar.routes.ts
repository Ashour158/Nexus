import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHttpClient, PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';
import type { createGoogleCalendarService } from '../services/google-calendar.service.js';

const calendarClient = createHttpClient({
  baseURL: 'https://www.googleapis.com/calendar/v3',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

const RangeQuery = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});
const CreateCalendarEvent = z.object({
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  activityId: z.string().min(1),
  summary: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function registerCalendarRoutes(
  app: FastifyInstance,
  prisma: IntegrationPrisma,
  calendar: ReturnType<typeof createGoogleCalendarService>
) {
  app.get(
    '/api/v1/integrations/calendar/events',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
    async (request, reply) => {
      const user = (request as unknown as { user: { tenantId: string } }).user;
      const q = RangeQuery.parse(request.query);
      const where = {
        tenantId: user.tenantId,
        syncedAt: {
          gte: q.start ? new Date(q.start) : undefined,
          lte: q.end ? new Date(q.end) : undefined,
        },
      };
      const data = await prisma.syncedCalendarEvent.findMany({
        where,
        orderBy: { syncedAt: 'desc' },
      });
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/integrations/calendar/sync',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
    async (request, reply) => {
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const data = await calendar.syncGoogleCalendar(user.tenantId, user.sub);
      return reply.send({ success: true, data });
    }
  );

  app.post(
    '/api/v1/integrations/calendar/events',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
    async (request, reply) => {
      const body = CreateCalendarEvent.parse(request.body);
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const tenantId = user.tenantId;
      const userId = user.sub;
    const connection = await prisma.oAuthConnection.findFirst({
      where: { tenantId, userId, provider: 'google' },
    });
    let externalId = `local-${body.activityId}`;
    if (connection) {
      try {
        const created = await calendarClient.post<{ id?: string; etag?: string }>(
          '/calendars/primary/events',
          {
            summary: body.summary,
            start: { dateTime: body.start },
            end: { dateTime: body.end },
            description: `activityId:${body.activityId}`,
          },
          { Authorization: `Bearer ${connection.accessToken}` }
        );
        externalId = created.id ?? externalId;
      } catch (err: any) {
        app.log.warn({ status: err?.status, statusText: err?.statusText }, 'Google Calendar API error');
      }
    }
    const data = await prisma.syncedCalendarEvent.upsert({
      where: { activityId: body.activityId },
      update: { externalId, syncedAt: new Date() },
      create: {
        tenantId,
        activityId: body.activityId,
        provider: connection ? 'google' : 'local',
        externalId,
      },
    });
    return reply.code(201).send({ success: true, data });
  });
}
