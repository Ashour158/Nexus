import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';
import type { createGoogleCalendarService } from '../services/google-calendar.service.js';

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

  app.post('/api/v1/integrations/calendar/events', async (request, reply) => {
    const body = CreateCalendarEvent.parse(request.body);
    const maybeUser = (request as unknown as { user?: { tenantId?: string; sub?: string } }).user;
    const tenantId = body.tenantId ?? maybeUser?.tenantId ?? 'public';
    const userId = body.userId ?? maybeUser?.sub ?? 'public';
    const connection = await prisma.oAuthConnection.findFirst({
      where: { tenantId, userId, provider: 'google' },
    });
    let externalId = `local-${body.activityId}`;
    if (connection) {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: body.summary,
          start: { dateTime: body.start },
          end: { dateTime: body.end },
          description: `activityId:${body.activityId}`,
        }),
      }).catch(() => null);
      if (res?.ok) {
        const created = (await res.json()) as { id?: string; etag?: string };
        externalId = created.id ?? externalId;
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
