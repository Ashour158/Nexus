import { createHttpClient } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';
import type { createFieldCrypto } from '../lib/crypto.js';
import type { createOauthService } from './oauth.service.js';

type FieldCrypto = ReturnType<typeof createFieldCrypto>;
type OauthService = ReturnType<typeof createOauthService>;

/**
 * Microsoft Graph calendar integration — the Outlook counterpart of
 * `google-calendar.service.ts`. Uses the stored Microsoft OAuth access token
 * (provider `'microsoft'` on OAuthConnection, scopes include
 * `Calendars.ReadWrite`) to create/update/delete real events on the user's
 * primary calendar via `https://graph.microsoft.com/v1.0/me/events`.
 *
 * Token handling mirrors `google-gmail.service.ts`: proactively refresh when the
 * access token is near expiry, and reactively refresh + retry once on a 401.
 */
const client = createHttpClient({
  baseURL: 'https://graph.microsoft.com/v1.0',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

/** A NexusHttpClient 401 (expired/invalid access token). */
function isAuthError(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string } | null;
  return e?.statusCode === 401 || e?.code === 'HTTP_401';
}

/** True if the access token is missing an expiry or is within 60s of expiring. */
function nearExpiry(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < 60_000;
}

/**
 * Graph's `dateTimeTimeZone` shape wants a naive wall-clock `dateTime` plus a
 * separate `timeZone`. CRM sends UTC ISO instants (`.toISOString()`), so we
 * normalise to UTC and strip the trailing `Z`/millis that Graph rejects.
 */
function graphDateTime(iso: string): { dateTime: string; timeZone: string } {
  const d = new Date(iso);
  return { dateTime: d.toISOString().replace(/\.\d{3}Z$/, ''), timeZone: 'UTC' };
}

export interface MicrosoftCalendarEventInput {
  activityId: string;
  summary: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  description?: string | null;
  location?: string | null;
  videoLink?: string | null;
  attendees?: Array<{ email: string; name?: string; optional?: boolean }>;
}

interface GraphEvent {
  id?: string;
  '@odata.etag'?: string;
}

/** Translate the shared CRM event shape into a Microsoft Graph `event` body. */
function buildGraphEvent(input: MicrosoftCalendarEventInput): Record<string, unknown> {
  const marker = `activityId:${input.activityId}`;
  const desc = input.description ? `${input.description}<br/><br/>${marker}` : marker;
  const body: Record<string, unknown> = {
    subject: input.summary || 'CRM Activity',
    body: { contentType: 'HTML', content: desc },
    start: graphDateTime(input.start),
    end: graphDateTime(input.end),
  };
  if (input.location) {
    body.location = { displayName: input.location };
  }
  if (input.attendees && input.attendees.length > 0) {
    body.attendees = input.attendees.map((a) => ({
      emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) },
      type: a.optional ? 'optional' : 'required',
    }));
  }
  // A video link means this is an online meeting. Graph generates its own Teams
  // join URL when `isOnlineMeeting` is set; we also keep the supplied link in
  // the body so an external (non-Teams) link is never lost.
  if (input.videoLink) {
    body.isOnlineMeeting = true;
    body.body = { contentType: 'HTML', content: `${desc}<br/><br/>Join: ${input.videoLink}` };
  }
  return body;
}

export function createMicrosoftCalendarService(
  prisma: IntegrationPrisma,
  crypto: FieldCrypto,
  oauth?: OauthService
) {
  /** Decrypt the stored access token (legacy plaintext rows pass through). */
  function readAccessToken(token: string): string {
    try {
      return crypto.decrypt(token);
    } catch {
      return token;
    }
  }

  /**
   * Resolve a usable access token for the connection, refreshing proactively
   * when near expiry. Returns null when there is no Microsoft connection.
   */
  async function resolveToken(
    tenantId: string,
    userId: string
  ): Promise<{ token: string; connId: string } | null> {
    const conn = await prisma.oAuthConnection.findFirst({
      where: { tenantId, userId, provider: 'microsoft' },
    });
    if (!conn) return null;
    let token = readAccessToken(conn.accessToken);
    if (oauth && nearExpiry(conn.expiresAt)) {
      const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'microsoft');
      if (refreshed) token = refreshed;
    }
    return { token, connId: conn.id };
  }

  return {
    /**
     * Create (POST /me/events) or update (PATCH /me/events/{id}) the external
     * Outlook event for a CRM activity. Pass the previously stored
     * `existingExternalId` to update in place, or null to create.
     * Throws on a hard provider failure so the caller can surface it (never
     * silently pretends success).
     */
    async createOrUpdateEvent(
      tenantId: string,
      userId: string,
      existingExternalId: string | null,
      input: MicrosoftCalendarEventInput
    ): Promise<{ externalId: string; etag?: string }> {
      const resolved = await resolveToken(tenantId, userId);
      if (!resolved) throw new Error('No Microsoft calendar connection');
      const payload = buildGraphEvent(input);

      const doCall = (tok: string): Promise<GraphEvent> =>
        existingExternalId
          ? client.patch<GraphEvent>(
              `/me/events/${encodeURIComponent(existingExternalId)}`,
              payload,
              { Authorization: `Bearer ${tok}` }
            )
          : client.post<GraphEvent>('/me/events', payload, {
              Authorization: `Bearer ${tok}`,
            });

      let res: GraphEvent;
      try {
        res = await doCall(resolved.token);
      } catch (err) {
        // Reactive refresh + single retry on 401.
        if (oauth && isAuthError(err)) {
          const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'microsoft');
          if (refreshed) {
            res = await doCall(refreshed);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      const externalId = res.id ?? existingExternalId;
      if (!externalId) throw new Error('Microsoft Graph did not return an event id');
      return { externalId, etag: res['@odata.etag'] };
    },

    /** Delete an Outlook event (DELETE /me/events/{id}). Best-effort refresh+retry on 401. */
    async deleteEvent(tenantId: string, userId: string, externalId: string): Promise<boolean> {
      const resolved = await resolveToken(tenantId, userId);
      if (!resolved) return false;
      const doCall = (tok: string) =>
        client.delete<unknown>(`/me/events/${encodeURIComponent(externalId)}`, {
          Authorization: `Bearer ${tok}`,
        });
      try {
        await doCall(resolved.token);
        return true;
      } catch (err) {
        if (oauth && isAuthError(err)) {
          const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'microsoft');
          if (refreshed) {
            try {
              await doCall(refreshed);
              return true;
            } catch {
              return false;
            }
          }
        }
        return false;
      }
    },

    /**
     * List events in a window via GET /me/calendarView. Best-effort: returns an
     * empty list on any failure (mirrors google-calendar.service's sync).
     */
    async listEvents(
      tenantId: string,
      userId: string,
      startIso: string,
      endIso: string
    ): Promise<Array<{ id: string; subject?: string }>> {
      const resolved = await resolveToken(tenantId, userId);
      if (!resolved) return [];
      const path =
        `/me/calendarView?startDateTime=${encodeURIComponent(startIso)}` +
        `&endDateTime=${encodeURIComponent(endIso)}&$top=250`;
      try {
        const body = await client.get<{ value?: Array<{ id: string; subject?: string }> }>(path, {
          Authorization: `Bearer ${resolved.token}`,
        });
        return body.value ?? [];
      } catch (err) {
        if (oauth && isAuthError(err)) {
          const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'microsoft');
          if (refreshed) {
            try {
              const body = await client.get<{ value?: Array<{ id: string; subject?: string }> }>(
                path,
                { Authorization: `Bearer ${refreshed}` }
              );
              return body.value ?? [];
            } catch {
              return [];
            }
          }
        }
        return [];
      }
    },
  };
}
