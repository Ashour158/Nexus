/**
 * Best-effort resolution of ROLE / MANAGER approvers via the auth-service
 * internal API. Every call is guarded: on missing config, non-2xx, or network
 * error we return `null` and callers fall back to the existing behavior
 * (default the step approver to the requester). This never throws.
 */

function authServiceUrl(): string {
  return process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';
}

function serviceToken(): string | undefined {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  return token && token.length > 0 ? token : undefined;
}

/**
 * Resolve the first user id holding `role` in the tenant.
 * Returns null when unavailable (missing token, network error, no match).
 */
export async function resolveRoleApprover(
  tenantId: string,
  role: string
): Promise<string | null> {
  const token = serviceToken();
  if (!token || !role) return null;
  try {
    const url = new URL('/api/v1/internal/users/by-role', authServiceUrl());
    url.searchParams.set('role', role);
    const res = await fetch(url.toString(), {
      headers: { 'x-service-token': token, 'x-tenant-id': tenantId },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { userIds?: unknown; users?: Array<{ id?: unknown }> };
    };
    const ids = body?.data?.userIds;
    if (Array.isArray(ids) && typeof ids[0] === 'string') return ids[0];
    const users = body?.data?.users;
    if (Array.isArray(users) && typeof users[0]?.id === 'string') {
      return users[0].id as string;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the manager id of `userId` within the tenant.
 * Returns null when unavailable (missing token, network error, no manager).
 */
export async function resolveManager(
  tenantId: string,
  userId: string
): Promise<string | null> {
  const token = serviceToken();
  if (!token || !userId) return null;
  try {
    const url = new URL(
      `/api/v1/internal/users/${encodeURIComponent(userId)}/manager`,
      authServiceUrl()
    );
    const res = await fetch(url.toString(), {
      headers: { 'x-service-token': token, 'x-tenant-id': tenantId },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { managerId?: unknown; manager?: { id?: unknown } };
    };
    const managerId = body?.data?.managerId ?? body?.data?.manager?.id;
    return typeof managerId === 'string' && managerId.length > 0 ? managerId : null;
  } catch {
    return null;
  }
}
