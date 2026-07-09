import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
import type { JwtPayload } from '@nexus/shared-types';

/**
 * Standalone JWT verification — the same trust model the REST bootstrap
 * (`createService` in `server.ts`) enforces via @fastify/jwt, but callable from
 * places that do not have a Fastify request in scope (notably the GraphQL-Yoga
 * context factory, which only receives a Fetch `Request`).
 *
 * Verification precedence mirrors the REST config exactly:
 *   1. `AUTH_JWKS_URL` set  → RS256, key resolved from auth-service JWKS by `kid`.
 *   2. otherwise            → HS256 with the static `JWT_SECRET`.
 *
 * A token is only trusted after its signature AND `exp`/`nbf` claims verify.
 * Every failure path returns `null` (never throws) so an unverifiable or absent
 * token degrades to an unauthenticated context rather than crashing the request
 * — and a momentary JWKS outage cannot take a service down at startup.
 */

// ─── JWKS resolution with a short TTL cache (shared with server.ts) ───────────
interface JwksEntry {
  // Public keys as SPKI PEM strings — verified with node:crypto directly.
  keysByKid: Map<string, string>;
  fetchedAt: number;
}
const JWKS_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map<string, JwksEntry>();

async function fetchJwks(url: string): Promise<JwksEntry> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status} ${url}`);
  const body = (await res.json()) as { keys?: Array<{ kid?: string; [k: string]: unknown }> };
  const keysByKid = new Map<string, string>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid) continue;
    const pem = createPublicKey({ key: jwk as Record<string, unknown>, format: 'jwk' })
      .export({ type: 'spki', format: 'pem' }) as string;
    keysByKid.set(jwk.kid, pem);
  }
  const entry: JwksEntry = { keysByKid, fetchedAt: Date.now() };
  jwksCache.set(url, entry);
  return entry;
}

/** Resolve the SPKI PEM public key for a token's `kid`, refetching JWKS on a miss. */
export async function resolveJwksPublicKey(url: string, token: string): Promise<string> {
  const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as { kid?: string };
  const kid = header.kid;
  if (!kid) throw new Error('Token header is missing a `kid`');

  let entry = jwksCache.get(url);
  const stale = !entry || Date.now() - entry.fetchedAt > JWKS_TTL_MS;
  if (!entry || stale || !entry.keysByKid.has(kid)) {
    entry = await fetchJwks(url);
  }
  const key = entry.keysByKid.get(kid);
  if (!key) throw new Error(`Unknown kid: ${kid}`);
  return key;
}

// ─── Token verification ───────────────────────────────────────────────────────

interface JwtHeader {
  alg?: string;
  kid?: string;
}

function decodeSegment<T>(segment: string | undefined): T {
  return JSON.parse(Buffer.from(segment ?? '', 'base64url').toString()) as T;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function assertNotExpired(payload: { exp?: number; nbf?: number }): void {
  const now = Math.floor(Date.now() / 1000);
  // 30s clock-skew leeway, matching typical JWT verifier defaults.
  const leeway = 30;
  if (typeof payload.exp === 'number' && now > payload.exp + leeway) {
    throw new Error('Token expired');
  }
  if (typeof payload.nbf === 'number' && now + leeway < payload.nbf) {
    throw new Error('Token not yet valid');
  }
}

/**
 * Verify a raw JWT and return its payload, or throw on any failure.
 *
 * @param jwksUrl  When provided, RS256 is enforced and the key is resolved from
 *                 this JWKS URL. When omitted, HS256 is verified with `secret`.
 * @param secret   HS256 shared secret; required when `jwksUrl` is not set.
 */
export async function verifyJwt(
  token: string,
  { jwksUrl, secret }: { jwksUrl?: string; secret?: string },
): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeSegment<JwtHeader>(headerB64);
  const signingInput = `${headerB64}.${payloadB64}`;

  if (jwksUrl) {
    if (header.alg !== 'RS256') throw new Error(`Unexpected alg: ${header.alg}`);
    const pem = await resolveJwksPublicKey(jwksUrl, token);
    const ok = cryptoVerify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      pem,
      Buffer.from(signatureB64!, 'base64url'),
    );
    if (!ok) throw new Error('Invalid RS256 signature');
  } else {
    if (!secret) throw new Error('No JWT secret configured');
    if (header.alg !== 'HS256') throw new Error(`Unexpected alg: ${header.alg}`);
    const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
    if (!timingSafeEqualStr(signatureB64!, expected)) throw new Error('Invalid HS256 signature');
  }

  const payload = decodeSegment<JwtPayload>(payloadB64);
  assertNotExpired(payload as { exp?: number; nbf?: number });
  return payload;
}

/**
 * Verify the JWT carried in an `Authorization: Bearer …` header, using the same
 * precedence as the REST bootstrap: `jwksUrl ?? process.env.AUTH_JWKS_URL` for
 * RS256, otherwise `secret ?? process.env.JWT_SECRET` for HS256.
 *
 * Returns the verified payload, or `null` when the header is missing/malformed
 * or the token fails verification for any reason. Never throws — callers use the
 * `null` result to build an unauthenticated context.
 */
export async function verifyBearerToken(
  authHeader: string | null | undefined,
  opts: { jwksUrl?: string; secret?: string } = {},
): Promise<JwtPayload | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const jwksUrl = opts.jwksUrl ?? process.env.AUTH_JWKS_URL;
  const secret = opts.secret ?? process.env.JWT_SECRET;
  try {
    return await verifyJwt(token, { jwksUrl, secret });
  } catch {
    return null;
  }
}
