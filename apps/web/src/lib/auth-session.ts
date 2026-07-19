/**
 * Shared post-authentication session flow used by the /login and /register
 * pages. Kept in one place so both entry points establish a session the exact
 * same way (RR-H10): decode the JWT for UI-gating claims, populate the in-memory
 * auth store, hand the raw token to the server-side route handler that writes it
 * into an HttpOnly cookie, and set the coarse-grained `nexus_session` presence
 * flag that middleware reads for route protection.
 */

/** Decode a JWT payload (base64url) in the browser without a dependency. */
export function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

/** Signature of the auth store's `setSession` action. */
type SetSessionFn = (payload: {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  tenantId: string;
  roles?: string[];
  permissions?: string[];
}) => void;

/**
 * Run the shared post-auth sequence given the tokens returned by
 * /auth/login or /auth/register. Identity/roles/permissions live in the JWT
 * claims, not the response body.
 *
 * The raw JWT is stored ONLY in a server-set HttpOnly, Secure, SameSite cookie:
 * this POST hands it to a server-side route handler that writes it via
 * `Set-Cookie` — it is never placed in `document.cookie` or web storage, so
 * client JS (and any XSS) can never read it. The server-side middleware reads
 * that HttpOnly cookie and attaches `Authorization: Bearer` when proxying
 * /api/* requests upstream. `document.cookie` only receives a non-secret
 * "a session exists" flag for middleware route protection.
 */
export async function establishSession(
  tokens: { accessToken: string; refreshToken?: string },
  setSession: SetSessionFn
): Promise<void> {
  const { accessToken, refreshToken } = tokens;
  const claims = decodeJwt(accessToken);
  setSession({
    accessToken,
    refreshToken,
    userId: String(claims.sub ?? ''),
    tenantId: String(claims.tenantId ?? ''),
    roles: Array.isArray(claims.roles) ? (claims.roles as string[]) : [],
    permissions: Array.isArray(claims.permissions)
      ? (claims.permissions as string[])
      : [],
  });
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  document.cookie = 'nexus_session=1;path=/;max-age=86400;SameSite=Lax';
}
