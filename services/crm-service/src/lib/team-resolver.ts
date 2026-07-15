import { createHttpClient } from '@nexus/service-utils';

/**
 * Team-membership resolution for `team`-scoped record visibility.
 *
 * A SALES_MANAGER granted `<resource>:read:team` may see records owned by
 * themselves and everyone in their reporting sub-tree (direct AND skip-level
 * reports — a VP sees their whole org, not just their direct line). This module
 * resolves that set of user ids from the auth-service, which owns the
 * manager → report relationship, via the recursive sub-tree lookup.
 *
 * FAIL-CLOSED contract:
 *  - There is no guaranteed backing endpoint for "direct reports of a manager".
 *    We attempt the conventional internal endpoint
 *    (`GET /api/v1/internal/users/:id/reports`, mirroring the existing
 *    `/internal/users/:id/manager` used by approval-service). If it is missing,
 *    errors, or returns nothing, we DO NOT widen visibility — we fall back to
 *    the manager's own id only (equivalent to `own` scope). Narrower is safer
 *    than leaking another user's records.
 *  - The acting user is ALWAYS included in the returned set.
 */

// auth-service listens on :3000 (crm itself is :3001) — the old :3001 default
// silently pointed team-resolution at crm and always collapsed team→own scope.
const authClient = createHttpClient({
  baseURL: process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3000',
});

/** Extract a list of string user ids from a loosely-typed internal response. */
function extractReportIds(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const root = body as Record<string, unknown>;
  // Accept a few conventional shapes: { data: [...] }, { data: { reports: [...] } },
  // { reports: [...] }, or a bare array.
  const candidates: unknown[] = [];
  if (Array.isArray(root)) candidates.push(root);
  if (Array.isArray(root.data)) candidates.push(root.data);
  if (Array.isArray(root.reports)) candidates.push(root.reports);
  const data = root.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.reports)) candidates.push(d.reports);
    if (Array.isArray(d.users)) candidates.push(d.users);
  }
  const arr = candidates[0];
  if (!Array.isArray(arr)) return [];
  const ids: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      ids.push(item);
    } else if (item && typeof item === 'object') {
      const id = (item as Record<string, unknown>).id;
      if (typeof id === 'string' && id.length > 0) ids.push(id);
    }
  }
  return ids;
}

/**
 * Resolve the set of user ids whose records a `team`-scoped caller may see:
 * the caller plus their direct reports. Always includes `userId`. On any
 * failure (missing endpoint, network error, empty result) falls back to
 * `[userId]` — never widens beyond what auth-service confirms.
 *
 * @param userId  the acting user (manager) id
 * @param token   the caller's bearer token, forwarded for auth-service authz
 */
export async function resolveTeamMemberIds(
  userId: string,
  token?: string,
  tenantId?: string
): Promise<string[]> {
  const self = new Set<string>([userId]);
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const internalToken = process.env.INTERNAL_SERVICE_TOKEN;
    if (internalToken) headers['x-service-token'] = internalToken;
    // auth-service's internal route can't read the caller's JWT tenant (its
    // global JWT preHandler is skipped for /internal/*), and a manager may have
    // no UserProfile row — so pass the caller's tenant explicitly to scope the
    // lookup. Without it the resolver returns empty and team collapses to own.
    if (tenantId) headers['x-tenant-id'] = tenantId;

    const body = await authClient.get(
      `/api/v1/internal/users/${encodeURIComponent(userId)}/reports?recursive=true`,
      headers
    );
    for (const id of extractReportIds(body)) self.add(id);
  } catch (err) {
    // Fail-closed: no backing endpoint / error ⇒ team collapses to `own`.
    // eslint-disable-next-line no-console
    console.warn(
      `[team-resolver] could not resolve direct reports for ${userId}; falling back to own-scope`,
      err
    );
  }
  return [...self];
}
