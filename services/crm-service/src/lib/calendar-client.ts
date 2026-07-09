/**
 * Client for integration-service's calendar API. The Google/Microsoft calendar
 * OAuth + external-event creation lives in integration-service
 * (`routes/calendar.routes.ts` + `services/google-calendar.service.ts`); only
 * Google is wired end-to-end today (Microsoft Graph is a documented follow-up).
 *
 * We forward the caller's user JWT so the external event is created under the
 * user's own OAuth connection and tenant, matching how the integration route
 * reads `request.user.{tenantId,sub}`.
 */
import { createHttpClient } from '@nexus/service-utils';

const BASE_URL = process.env.INTEGRATION_SERVICE_URL ?? 'http://localhost:3012';

const client = createHttpClient({
  baseURL: BASE_URL,
  maxRetries: 2,
  timeoutMs: 8_000,
});

export interface PushCalendarEventInput {
  activityId: string;
  summary: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
}

export interface PushCalendarEventResult {
  externalId: string;
  provider: string; // 'google' | 'local'
}

/**
 * Create/update the external calendar event for an activity via
 * integration-service. Returns the external event id + provider so the caller
 * can persist `externalCalendarEventId` on the Activity. Fail-soft: on any
 * transport error the caller decides how to surface it.
 */
export async function pushCalendarEvent(
  authorization: string | undefined,
  input: PushCalendarEventInput
): Promise<PushCalendarEventResult> {
  const headers: Record<string, string> = {};
  if (authorization) headers.Authorization = authorization;
  const res = await client.post<{
    success: boolean;
    data?: { externalId?: string; provider?: string };
  }>('/api/v1/integrations/calendar/events', input, headers);
  return {
    externalId: res.data?.externalId ?? `local-${input.activityId}`,
    provider: res.data?.provider ?? 'local',
  };
}
