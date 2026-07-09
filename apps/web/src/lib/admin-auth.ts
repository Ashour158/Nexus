import { NextRequest } from 'next/server';
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';

interface AdminIdentity {
  userId: string;
  role: string;
  roles: string[];
  tenantId: string;
  permissions: string[];
}

const JWKS_URL =
  process.env.AUTH_JWKS_URL ?? 'http://auth-service:3000/.well-known/jwks.json';
const JWKS_TTL_MS = 5 * 60 * 1000;
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'admin'];

let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null;

async function getJwks(): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: JsonWebKey[] };
  jwksCache = { keys: data.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function toRoles(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * Verifies an RS256 JWT against the auth-service JWKS. Returns the decoded
 * payload only if the signature is valid and the token is unexpired.
 * No third-party dependency — node:crypto imports the JWK directly.
 */
async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlToBuf(headerB64!).toString('utf8'));
    payload = JSON.parse(b64urlToBuf(payloadB64!).toString('utf8'));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;

  const keys = await getJwks();
  const jwk =
    keys.find((k) => (k as JsonWebKey & { kid?: string }).kid === header.kid) ?? keys[0];
  if (!jwk) return null;

  let pubKey;
  try {
    pubKey = createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return null;
  }
  const ok = cryptoVerify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    pubKey,
    b64urlToBuf(sigB64!)
  );
  if (!ok) return null;
  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

/**
 * Gate for admin BFF routes. Requires a signature-verified token whose roles
 * include an admin role, or whose permissions include the '*' wildcard.
 * The prior implementation trusted an `x-admin-role` header and an *unverified*
 * JWT payload — both are removed here.
 */
export async function requireAdmin(req?: NextRequest): Promise<AdminIdentity> {
  const authHeader = req?.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? await verifyJwt(token) : null;
  if (!payload) {
    const error = new Error('Unauthorized') as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  const roles = toRoles(payload.roles);
  const permissions = toRoles(payload.permissions);
  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r)) || permissions.includes('*');
  if (!isAdmin) {
    const error = new Error('Forbidden') as Error & { status?: number };
    error.status = 403;
    throw error;
  }
  return {
    userId: typeof payload.sub === 'string' ? payload.sub : '',
    role: roles[0] ?? 'admin',
    roles,
    tenantId: typeof payload.tenantId === 'string' ? payload.tenantId : '',
    permissions,
  };
}
