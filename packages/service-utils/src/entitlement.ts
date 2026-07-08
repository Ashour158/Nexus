/**
 * Entitlement enforcement (COM-04).
 *
 * `plan.features` describe what a tenant's subscription includes. This module
 * turns those feature flags into an enforceable gate so gated endpoints 403
 * (code `FEATURE_NOT_ENTITLED`) when the tenant's active subscription/plan does
 * not include the required feature.
 *
 * ── How features are resolved ────────────────────────────────────────────────
 * The guard resolves the *current tenant's* entitlement set (a `string[]` of
 * feature keys) through a pluggable resolver:
 *
 *   • Default (cross-service): an HTTP GET to
 *       `${BILLING_SERVICE_URL}/internal/entitlements?tenantId=<tenant>`
 *     which returns `{ success, data: { tenantId, features, plan, status } }`.
 *     Results are cached in-memory per tenant for `ENTITLEMENT_CACHE_TTL_MS`
 *     (default 60s) so the hot path costs one lookup per minute per tenant.
 *
 *   • Local (in-process): billing-service passes its own resolver (querying its
 *     Prisma directly) via `requireEntitlement(key, { resolve })` so it does not
 *     HTTP-call itself. See billing-service `entitlements.ts`.
 *
 * ── How another service adopts it ────────────────────────────────────────────
 *   1. Set `BILLING_SERVICE_URL` to billing's service ROOT (the internal route
 *      lives at `/internal/entitlements`, NOT under `/api/v1/billing`), e.g.
 *      `http://billing-service:3011`, plus a shared `INTERNAL_SERVICE_TOKEN`.
 *   2. Add the guard to a route's `preHandler`, after `requirePermission`:
 *
 *        import { requireEntitlement } from '@nexus/service-utils';
 *        r.post('/campaigns/send', {
 *          preHandler: [requirePermission(P.CAMPAIGNS.SEND),
 *                       requireEntitlement('bulk_email')],
 *        }, handler);
 *
 *   RBAC answers "may this user do X"; entitlement answers "does this tenant's
 *   plan include X". They compose — run both.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { createHttpClient, type NexusHttpClient } from './http-client.js';

/** Resolves the set of feature keys a tenant is currently entitled to. */
export type EntitlementResolver = (tenantId: string) => Promise<string[]>;

interface CacheEntry {
  features: string[];
  expiresAt: number;
}

const DEFAULT_TTL_MS = Number(process.env.ENTITLEMENT_CACHE_TTL_MS ?? 60_000);

// Per-tenant in-memory cache shared across all guards in a process.
const cache = new Map<string, CacheEntry>();

let defaultResolver: EntitlementResolver | null = null;
let httpClient: NexusHttpClient | null = null;

/**
 * Override the default (HTTP → billing) resolver process-wide. billing-service
 * calls this at boot with a Prisma-backed resolver so it never HTTP-calls
 * itself; other services can leave it unset and rely on the HTTP default.
 */
export function setEntitlementResolver(resolver: EntitlementResolver): void {
  defaultResolver = resolver;
}

/** Clear the entitlement cache (all tenants, or one). Exposed for tests/webhooks. */
export function clearEntitlementCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/** The built-in resolver: HTTP GET billing-service's internal entitlements endpoint. */
async function httpResolve(tenantId: string): Promise<string[]> {
  const base = process.env.BILLING_SERVICE_URL;
  if (!base) {
    // No billing URL configured → cannot resolve. Fail OPEN by returning an
    // empty set is unsafe (would block); instead throw so the guard surfaces a
    // clear misconfiguration rather than silently denying every tenant.
    throw new Error(
      'BILLING_SERVICE_URL is not set; cannot resolve tenant entitlements'
    );
  }
  if (!httpClient) {
    httpClient = createHttpClient({ baseURL: base, timeoutMs: 5_000, maxRetries: 2 });
  }
  // billing-service's /internal/entitlements is service-only; authenticate with
  // the shared INTERNAL_SERVICE_TOKEN (same header both services must configure).
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN;
  const headers = serviceToken ? { 'x-service-token': serviceToken } : undefined;
  const res = await httpClient.get<{
    success?: boolean;
    data?: { features?: unknown };
  }>(`/internal/entitlements?tenantId=${encodeURIComponent(tenantId)}`, headers);
  const features = res?.data?.features;
  return Array.isArray(features) ? features.map((f) => String(f)) : [];
}

async function resolveEntitlements(
  tenantId: string,
  resolver: EntitlementResolver,
  ttlMs: number
): Promise<string[]> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.features;

  const features = await resolver(tenantId);
  cache.set(tenantId, { features, expiresAt: now + ttlMs });
  return features;
}

export interface RequireEntitlementOptions {
  /** Custom resolver (e.g. Prisma-backed for in-process use). */
  resolve?: EntitlementResolver;
  /** Per-guard cache TTL override in ms. */
  ttlMs?: number;
  /**
   * When true, a resolver error (e.g. billing unreachable) allows the request
   * through instead of 503-ing. Defaults to false (fail closed).
   */
  failOpen?: boolean;
}

/**
 * Fastify preHandler that 403s (`FEATURE_NOT_ENTITLED`) when the request's
 * tenant is not entitled to `featureKey`. Wildcard `*` in the tenant's feature
 * set grants everything.
 */
export function requireEntitlement(featureKey: string, opts: RequireEntitlementOptions = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated', requestId: request.id },
      });
    }

    const resolver = opts.resolve ?? defaultResolver ?? httpResolve;

    let features: string[];
    try {
      features = await resolveEntitlements(user.tenantId, resolver, ttlMs);
    } catch (err) {
      request.log?.warn?.({ err, featureKey }, 'Entitlement resolution failed');
      if (opts.failOpen) return;
      return reply.code(503).send({
        success: false,
        error: {
          code: 'ENTITLEMENT_UNAVAILABLE',
          message: 'Unable to verify plan entitlements',
          requestId: request.id,
        },
      });
    }

    const entitled = features.includes('*') || features.includes(featureKey);
    if (!entitled) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FEATURE_NOT_ENTITLED',
          message: `Your plan does not include the "${featureKey}" feature`,
          details: { featureKey },
          requestId: request.id,
        },
      });
    }
  };
}
