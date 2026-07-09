/**
 * Portal-user auth primitives (B9). Self-contained, zero new dependencies:
 *
 *  - Passwords are hashed with scrypt (`scrypt$<saltHex>$<hashHex>`), verified in
 *    constant time.
 *  - Portal sessions are compact HMAC-SHA256 tokens (`<payloadB64>.<sigB64>`)
 *    signed with a secret that is DELIBERATELY DISTINCT from the service
 *    JWT_SECRET, so a portal session can never be replayed as an end-user JWT
 *    against other services. The secret is `PORTAL_SESSION_SECRET` when set,
 *    otherwise a stable value derived from JWT_SECRET via HMAC (so it differs
 *    from JWT_SECRET but needs no extra config).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

/** Hash a plaintext password for storage. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Verify a plaintext password against a stored `scrypt$salt$hash` digest. */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

function sessionSecret(): string {
  const explicit = process.env.PORTAL_SESSION_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const jwtSecret = process.env.JWT_SECRET ?? '';
  // Derive a stable, distinct-from-JWT secret so portal tokens are never valid
  // end-user JWTs even when PORTAL_SESSION_SECRET is not configured.
  return createHmac('sha256', jwtSecret).update('nexus-portal-session-v1').digest('hex');
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PortalSession {
  sub: string; // PortalUser id
  tid: string; // tenantId
  acc: string; // accountId
  exp: number; // epoch seconds
}

/** Issue a signed portal session token valid for `ttlSeconds` (default 12h). */
export function signPortalSession(
  session: Omit<PortalSession, 'exp'>,
  ttlSeconds = 12 * 60 * 60
): { token: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: PortalSession = { ...session, exp };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', sessionSecret()).update(payloadB64).digest());
  return { token: `${payloadB64}.${sig}`, expiresAt: new Date(exp * 1000) };
}

/** Verify a portal session token; returns the session or null when invalid/expired. */
export function verifyPortalSession(token: string): PortalSession | null {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    const expected = b64url(createHmac('sha256', sessionSecret()).update(payloadB64).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')) as PortalSession;
    if (!payload.sub || !payload.tid || !payload.acc || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
