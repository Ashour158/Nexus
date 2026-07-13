import type { PlanningPrisma } from '../prisma.js';
import type { ForecastCategory } from './forecast-rollup.service.js';

/**
 * Deal-stage → forecast-category mapping.
 *
 * A tenant configures, per deal stage, which forecast category the stage rolls
 * into (COMMIT | BEST_CASE | PIPELINE | OMITTED | CLOSED). The mapping is:
 *
 *   1. explicit {@link ForecastCategoryMap} row for the stage (tenant config), else
 *   2. a deterministic default derived from the stage name (heuristic), else
 *   3. `null` — the caller falls back to the deal's own forecastCategory /
 *      probability bucket (the pre-existing behavior).
 *
 * Reads on the deal-event hot path are cached in-memory per tenant with a TTL so
 * categorization never issues a DB query per event. Writes invalidate the cache.
 */

export const FORECAST_CATEGORY_KINDS = [
  'COMMIT',
  'BEST_CASE',
  'PIPELINE',
  'OMITTED',
  'CLOSED',
] as const;
export type ForecastCategoryKind = (typeof FORECAST_CATEGORY_KINDS)[number];

export function isCategoryKind(v: unknown): v is ForecastCategoryKind {
  return typeof v === 'string' && (FORECAST_CATEGORY_KINDS as readonly string[]).includes(v);
}

/** Public category kind → internal roll-up category. */
export function kindToInternal(kind: ForecastCategoryKind): ForecastCategory {
  switch (kind) {
    case 'COMMIT':
      return 'commit';
    case 'BEST_CASE':
      return 'best_case';
    case 'PIPELINE':
      return 'pipeline';
    case 'CLOSED':
      return 'won';
    case 'OMITTED':
      return 'lost';
  }
}

/** Internal roll-up category → public category kind. */
export function internalToKind(category: ForecastCategory): ForecastCategoryKind {
  switch (category) {
    case 'commit':
      return 'COMMIT';
    case 'best_case':
      return 'BEST_CASE';
    case 'pipeline':
      return 'PIPELINE';
    case 'won':
      return 'CLOSED';
    case 'lost':
      return 'OMITTED';
  }
}

/**
 * Deterministic default when a tenant has no explicit mapping for a stage.
 * Purely name-based so it is stable across replays; returns `null` when the
 * stage name gives no signal (caller then falls back to probability bucketing).
 */
export function defaultCategoryForStage(stage: string): ForecastCategoryKind | null {
  const s = stage.trim().toLowerCase();
  if (!s) return null;
  if (/(closed[\s_-]*won|\bwon\b)/.test(s)) return 'CLOSED';
  if (/(closed[\s_-]*lost|\blost\b|abandon|disqualif|no[\s_-]*decision)/.test(s)) return 'OMITTED';
  if (/(commit|contract|verbal|negotiat|signature|final)/.test(s)) return 'COMMIT';
  if (/(proposal|propos|quote|best[\s_-]*case|evaluat|demo|poc)/.test(s)) return 'BEST_CASE';
  if (/(prospect|qualif|discovery|lead|new|open|pipeline)/.test(s)) return 'PIPELINE';
  return null;
}

const CACHE_TTL_MS = Number(process.env.FORECAST_CATEGORY_MAP_TTL_MS ?? 5 * 60 * 1000);

interface CachedMap {
  map: Map<string, ForecastCategoryKind>;
  fetchedAt: number;
}

export function createCategoryMapService(prisma: PlanningPrisma) {
  const cache = new Map<string, CachedMap>();

  async function loadMap(tenantId: string): Promise<Map<string, ForecastCategoryKind>> {
    const cached = cache.get(tenantId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.map;
    const rows = await prisma.forecastCategoryMap.findMany({ where: { tenantId } });
    const map = new Map<string, ForecastCategoryKind>();
    for (const r of rows) map.set(r.stage, r.category as ForecastCategoryKind);
    cache.set(tenantId, { map, fetchedAt: Date.now() });
    return map;
  }

  function invalidate(tenantId: string): void {
    cache.delete(tenantId);
  }

  return {
    /**
     * Resolve the configured/default category KIND for a stage, or `null` when
     * neither an explicit mapping nor a name-based default applies. Cached; safe
     * to call on the deal-event hot path.
     */
    async resolveKind(tenantId: string, stage: string): Promise<ForecastCategoryKind | null> {
      const token = (stage ?? '').trim();
      if (!token) return null;
      const map = await loadMap(tenantId);
      return map.get(token) ?? defaultCategoryForStage(token);
    },

    /**
     * Resolve directly to the internal roll-up category (or `null`). Used by the
     * consumer to override the provisional category with the stage mapping.
     */
    async resolveInternal(tenantId: string, stage: string): Promise<ForecastCategory | null> {
      const kind = await this.resolveKind(tenantId, stage);
      return kind ? kindToInternal(kind) : null;
    },

    async list(tenantId: string) {
      const rows = await prisma.forecastCategoryMap.findMany({
        where: { tenantId },
        orderBy: { stage: 'asc' },
      });
      return rows.map((r) => ({
        id: r.id,
        stage: r.stage,
        category: r.category as ForecastCategoryKind,
        updatedAt: r.updatedAt,
      }));
    },

    /** Upsert one stage → category mapping (idempotent on tenant+stage). */
    async upsertOne(tenantId: string, stage: string, category: ForecastCategoryKind) {
      const row = await prisma.forecastCategoryMap.upsert({
        where: { tenantId_stage: { tenantId, stage } },
        update: { category },
        create: { tenantId, stage, category },
      });
      invalidate(tenantId);
      return row;
    },

    /** Replace/insert many mappings in one call. */
    async bulkSet(
      tenantId: string,
      entries: Array<{ stage: string; category: ForecastCategoryKind }>
    ) {
      const results = [];
      for (const e of entries) {
        results.push(
          await prisma.forecastCategoryMap.upsert({
            where: { tenantId_stage: { tenantId, stage: e.stage } },
            update: { category: e.category },
            create: { tenantId, stage: e.stage, category: e.category },
          })
        );
      }
      invalidate(tenantId);
      return results;
    },

    async remove(tenantId: string, stage: string): Promise<boolean> {
      const existing = await prisma.forecastCategoryMap.findFirst({ where: { tenantId, stage } });
      if (!existing) return false;
      await prisma.forecastCategoryMap.delete({ where: { id: existing.id } });
      invalidate(tenantId);
      return true;
    },
  };
}

export type CategoryMapService = ReturnType<typeof createCategoryMapService>;
