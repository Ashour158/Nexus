import { createHttpClient } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';

const client = createHttpClient({
  baseURL: 'https://www.googleapis.com/calendar/v3',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export function createGoogleCalendarService(prisma: IntegrationPrisma) {
  return {
    async syncGoogleCalendar(tenantId: string, userId: string) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { tenantId, userId, provider: 'google' },
      });
      if (!conn) return { synced: 0 };
      const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      try {
        const body = await client.get<{
          items?: Array<{ id: string; etag?: string; description?: string }>;
        }>(
          `/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=250`,
          authHeader(conn.accessToken)
        );
        let synced = 0;
        for (const e of body.items ?? []) {
          const activityId = e.description?.match(/activityId:([a-zA-Z0-9]+)/)?.[1];
          if (!activityId) continue;
          await prisma.syncedCalendarEvent.upsert({
            where: { activityId },
            update: { externalId: e.id, etag: e.etag ?? null, syncedAt: new Date() },
            create: {
              tenantId,
              activityId,
              provider: 'google',
              externalId: e.id,
              etag: e.etag ?? null,
            },
          });
          synced += 1;
        }
        return { synced };
      } catch {
        return { synced: 0 };
      }
    },

    async pushCrmActivityToGoogle(
      tenantId: string,
      userId: string,
      activity: {
        id: string;
        subject?: string;
        description?: string | null;
        dueDate?: string | Date | null;
        startDate?: string | Date | null;
        endDate?: string | Date | null;
        duration?: number | null;
      }
    ) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { tenantId, userId, provider: 'google' },
      });
      if (!conn) return null;
      const start = activity.startDate ?? activity.dueDate;
      if (!start) return null;
      const startDate = new Date(start);
      const endDate = activity.endDate
        ? new Date(activity.endDate)
        : new Date(startDate.getTime() + (activity.duration ?? 30) * 60_000);
      const existing = await prisma.syncedCalendarEvent.findUnique({
        where: { activityId: activity.id },
      });
      try {
        const body = existing
          ? await client.patch<{ id: string; etag?: string }>(
              `/calendars/primary/events/${existing.externalId}`,
              {
                summary: activity.subject ?? 'CRM Activity',
                description: `${activity.description ?? ''}\n\nactivityId:${activity.id}`.trim(),
                start: { dateTime: startDate.toISOString() },
                end: { dateTime: endDate.toISOString() },
              },
              authHeader(conn.accessToken)
            )
          : await client.post<{ id: string; etag?: string }>(
              '/calendars/primary/events',
              {
                summary: activity.subject ?? 'CRM Activity',
                description: `${activity.description ?? ''}\n\nactivityId:${activity.id}`.trim(),
                start: { dateTime: startDate.toISOString() },
                end: { dateTime: endDate.toISOString() },
              },
              authHeader(conn.accessToken)
            );
        return prisma.syncedCalendarEvent.upsert({
          where: { activityId: activity.id },
          update: { externalId: body.id, etag: body.etag ?? null, syncedAt: new Date() },
          create: {
            tenantId,
            activityId: activity.id,
            provider: 'google',
            externalId: body.id,
            etag: body.etag ?? null,
          },
        });
      } catch {
        return null;
      }
    },
  };
}
