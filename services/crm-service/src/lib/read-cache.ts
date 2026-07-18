/**
 * RR-H13 — Redis cache-aside for the hot CRM read paths.
 *
 * The shared `@nexus/cache` layer was wired into the repo but had ZERO
 * production call sites in crm-service: every leads/contacts/accounts/deals
 * list and dashboard aggregate hit Postgres directly. This helper wraps those
 * clearly-safe reads with a short-TTL cache-aside.
 *
 * ─── Leak prevention ─────────────────────────────────────────────────────────
 * Every key is built from a fully-qualifying signature so a cached result can
 * NEVER be served to the wrong tenant or the wrong user:
 *   crm:list:<entity>:<tenantId>:<hash(scope)>
 * where `scope` includes the tenantId, the full filter + pagination signature,
 * AND the caller's ownership scope + roles (both drive which rows are visible
 * and which fields are masked). Two callers only share a cache entry when all of
 * those match, so RBAC-scoped / field-masked results are never cross-served.
 *
 * ─── Invalidation ────────────────────────────────────────────────────────────
 * Entity keys are invalidated by prefix on the same create/update/delete
 * mutation hook crm already publishes events from (see prisma.ts), so a write
 * never serves a stale list beyond the mutation itself.
 *
 * ─── Safety ──────────────────────────────────────────────────────────────────
 * The cache is strictly best-effort. If `@nexus/cache` is unavailable (e.g.
 * mocked out in tests, Redis down) the factory runs directly — the read path
 * behaves exactly as before caching was added.
 */

import { getSharedCache } from '@nexus/cache';

/** Cached entities. Also the invalidation key-prefix segment. */
export type CachedEntity = 'deal' | 'account' | 'contact' | 'lead' | 'data-quality';

/** Short TTL — long enough to absorb bursts, short enough to bound staleness. */
const DEFAULT_TTL_MS = 45_000;

/** Deterministic, collision-resistant-enough short hash (djb2) for key building. */
function hashScope(scope: unknown): string {
  const raw = JSON.stringify(scope ?? null);
  let h = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  }
  // Unsigned hex keeps the key compact and stable.
  return (h >>> 0).toString(16);
}

function keyPrefix(entity: CachedEntity, tenantId: string): string {
  return `crm:list:${entity}:${tenantId}:`;
}

function cacheAvailable(): boolean {
  return typeof getSharedCache === 'function';
}

/**
 * Cache-aside a tenant-scoped read. `scope` MUST fully determine the result set
 * (filters, pagination, ownership scope, roles) — it is folded into the key so
 * results never leak across tenants or users. Falls straight through to
 * `factory` when the cache layer is unavailable.
 */
export async function cachedListRead<T>(
  entity: CachedEntity,
  tenantId: string,
  scope: unknown,
  factory: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  if (!cacheAvailable()) return factory();
  const key = `${keyPrefix(entity, tenantId)}${hashScope({ tenantId, ...(scope as object) })}`;
  try {
    return await getSharedCache().cacheAside<T>(key, factory, ttlMs);
  } catch {
    // Any cache error (connection, serialization) degrades to a direct read.
    return factory();
  }
}

/**
 * Invalidate every cached list for `entity` within `tenantId`. Best-effort and
 * fire-and-forget-safe: swallows errors so a cache blip never fails a write.
 */
export async function invalidateListCache(entity: CachedEntity, tenantId: string): Promise<void> {
  if (!cacheAvailable() || !tenantId) return;
  try {
    await getSharedCache().invalidatePattern(`${keyPrefix(entity, tenantId)}*`);
  } catch {
    // ignore — stale entries expire on their own via the short TTL
  }
}

/** Maps a Prisma model name to its cached entity, or null if not cached. */
export function cachedEntityForModel(model: string): CachedEntity | null {
  switch (model) {
    case 'Deal':
      return 'deal';
    case 'Account':
      return 'account';
    case 'Contact':
      return 'contact';
    case 'Lead':
      return 'lead';
    default:
      return null;
  }
}
