import type { IntegrationPrisma } from '../prisma.js';

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
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=250`,
        { headers: authHeader(conn.accessToken) }
      );
      if (!res.ok) return { synced: 0 };
      const body = (await res.json()) as { items?: Array<{ id: string; etag?: string; description?: string }> };
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
      const url = existing
        ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existing.externalId}`
        : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
      const res = await fetch(url, {
        method: existing ? 'PATCH' : 'POST',
        headers: {
          ...authHeader(conn.accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: activity.subject ?? 'CRM Activity',
          description: `${activity.description ?? ''}\n\nactivityId:${activity.id}`.trim(),
          start: { dateTime: startDate.toISOString() },
          end: { dateTime: endDate.toISOString() },
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { id: string; etag?: string };
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
    },
  };
}
