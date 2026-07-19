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
  email?: string;
  displayName?: string;
  roles?: string[];
  permissions?: string[];
}) => void;

/**
 * Build a human-readable display name for the signed-in user.
 *
 * Prefers a real name claim when the token carries one (`name`, or
 * `firstName`/`lastName`); otherwise falls back to the email local-part with
 * dots/underscores/hyphens/digits-suffix cleaned up and each word title-cased:
 * `admin@demo.com` → `Admin`, `jane.doe@acme.io` → `Jane Doe`.
 *
 * Returns `undefined` when there is nothing human-readable to show — callers
 * must fall back to email or a neutral label, NEVER to the raw user id (cuid).
 */
export function deriveDisplayName(claims: Record<string, unknown>): string | undefined {
  const titleCase = (value: string) =>
    value
      .split(/[\s._-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();

  const name = typeof claims.name === 'string' ? claims.name.trim() : '';
  if (name) return name;

  const first = typeof claims.firstName === 'string' ? claims.firstName.trim() : '';
  const last = typeof claims.lastName === 'string' ? claims.lastName.trim() : '';
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const email = typeof claims.email === 'string' ? claims.email.trim() : '';
  const localPart = email.split('@')[0] ?? '';
  const cleaned = titleCase(localPart);
  return cleaned || undefined;
}

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
    // Identity metadata for the UI. `email` is a verified claim on the token;
    // `displayName` is derived from it so greetings/profile never render the
    // opaque `sub` cuid.
    email: typeof claims.email === 'string' ? claims.email : undefined,
    displayName: deriveDisplayName(claims),
    roles: Array.isArray(claims.roles) ? (claims.roles as string[]) : [],
    permissions: Array.isArray(claims.permissions)
      ? (claims.permissions as string[])
      : [],
  });
  // Hand BOTH tokens to the server-side handler. The refresh token is what lets
  // /api/auth/session/refresh mint a new access token once the ~15m JWT expires
  // — without it the cookie session dies silently mid-use and every API call
  // starts failing while the user still appears signed in.
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, refreshToken }),
  });
  document.cookie = 'nexus_session=1;path=/;max-age=86400;SameSite=Lax;Secure';
}
