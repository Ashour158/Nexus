import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHttpClient, PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';
import type { createGoogleCalendarService } from '../services/google-calendar.service.js';
import type { createMicrosoftCalendarService } from '../services/microsoft-calendar.service.js';
import type { createFieldCrypto } from '../lib/crypto.js';

type FieldCrypto = ReturnType<typeof createFieldCrypto>;

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
  // Optional explicit target. When omitted we pick whichever calendar the user
  // has connected (Google preferred if both are connected).
  provider: z.enum(['google', 'microsoft']).optional(),
  // Optional richer fields — mapped through to whichever provider is chosen.
  description: z.string().optional(),
  location: z.string().optional(),
  videoLink: z.string().optional(),
  attendees: z
    .array(z.object({ email: z.string(), name: z.string().optional(), optional: z.boolean().optional() }))
    .optional(),
});

export async function registerCalendarRoutes(
  app: FastifyInstance,
  prisma: IntegrationPrisma,
  calendar: ReturnType<typeof createGoogleCalendarService>,
  crypto: FieldCrypto,
  microsoft: ReturnType<typeof createMicrosoftCalendarService>
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

      // Resolve which calendar to write to. Explicit `provider` wins when that
      // provider is actually connected; otherwise fall back to whatever the user
      // has connected (Google preferred when both are).
      const [googleConn, microsoftConn] = await Promise.all([
        prisma.oAuthConnection.findFirst({ where: { tenantId, userId, provider: 'google' } }),
        prisma.oAuthConnection.findFirst({ where: { tenantId, userId, provider: 'microsoft' } }),
      ]);

      let target: 'google' | 'microsoft' | null;
      if (body.provider === 'google') target = googleConn ? 'google' : null;
      else if (body.provider === 'microsoft') target = microsoftConn ? 'microsoft' : null;
      else target = googleConn ? 'google' : microsoftConn ? 'microsoft' : null;

      if (!target) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'NO_CALENDAR_CONNECTED',
            message: body.provider
              ? `No ${body.provider} calendar is connected for this user`
              : 'No calendar provider is connected for this user',
            requestId: request.id,
          },
        });
      }

      const existing = await prisma.syncedCalendarEvent.findUnique({
        where: { activityId: body.activityId },
      });
      const existingExternalId = existing?.provider === target ? existing.externalId : null;

      let externalId: string;
      try {
        if (target === 'microsoft') {
          const res = await microsoft.createOrUpdateEvent(tenantId, userId, existingExternalId, {
            activityId: body.activityId,
            summary: body.summary,
            start: body.start,
            end: body.end,
            description: body.description,
            location: body.location,
            videoLink: body.videoLink,
            attendees: body.attendees,
          });
          externalId = res.externalId;
        } else {
          // Google — create or update in place (matches google-calendar.service).
          const accessToken = crypto.decrypt(googleConn!.accessToken);
          const marker = `activityId:${body.activityId}`;
          const payload: Record<string, unknown> = {
            summary: body.summary,
            description: body.description ? `${body.description}\n\n${marker}` : marker,
            start: { dateTime: body.start },
            end: { dateTime: body.end },
            ...(body.location ? { location: body.location } : {}),
            ...(body.attendees && body.attendees.length > 0
              ? { attendees: body.attendees.map((a) => ({ email: a.email, optional: a.optional })) }
              : {}),
          };
          const gRes = existingExternalId
            ? await calendarClient.patch<{ id?: string }>(
                `/calendars/primary/events/${existingExternalId}`,
                payload,
                { Authorization: `Bearer ${accessToken}` }
              )
            : await calendarClient.post<{ id?: string }>('/calendars/primary/events', payload, {
                Authorization: `Bearer ${accessToken}`,
              });
          if (!gRes.id) throw new Error('Google Calendar did not return an event id');
          externalId = gRes.id;
        }
      } catch (err: unknown) {
        const e = err as { statusCode?: number; statusText?: string } | undefined;
        app.log.warn(
          { provider: target, status: e?.statusCode, statusText: e?.statusText },
          'Calendar provider API error'
        );
        return reply.code(502).send({
          success: false,
          error: {
            code: 'CALENDAR_PROVIDER_ERROR',
            message: `${target} calendar API call failed`,
            requestId: request.id,
          },
        });
      }

      const data = await prisma.syncedCalendarEvent.upsert({
        where: { activityId: body.activityId },
        update: { externalId, provider: target, syncedAt: new Date() },
        create: {
          tenantId,
          activityId: body.activityId,
          provider: target,
          externalId,
        },
      });
      // `data` carries both `externalId` and `provider`; CRM reads those to
      // persist externalCalendarEventId + externalCalendarProvider.
      return reply.code(existing ? 200 : 201).send({ success: true, data });
    }
  );
}
