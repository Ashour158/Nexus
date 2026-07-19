/**
 * Thin, guarded client for analytics-service (ClickHouse-backed read model).
 *
 * Every call is wrapped in a timeout + try/catch and returns `null` on any
 * failure (network error, non-2xx, timeout, malformed body). Callers must
 * treat `null` as "analytics unavailable" and fall back to snapshot/empty data
 * so reporting never throws just because analytics is down.
 *
 * Auth mirrors the pattern already used by report-engine.ts:
 *   Authorization: Bearer <INTERNAL_SERVICE_TOKEN>  +  x-tenant-id header.
 */

const DEFAULT_TIMEOUT_MS = 4000;

function analyticsBaseUrl(): string {
  // ANALYTICS_SERVICE_URL already includes the `/api/v1/analytics` prefix in the
  // rest of the codebase (see report-engine.ts / executor.service.ts).
  return process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3008/api/v1/analytics';
}

/**
 * Perform a guarded GET against analytics-service.
 * Returns the `data` field of the standard `{ success, data }` envelope, or
 * `null` if the call fails for any reason.
 */
async function analyticsGet<T>(
  tenantId: string,
  path: string,
  query: Record<string, string | number | undefined> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T | null> {
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const url = new URL(`${analyticsBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { success?: boolean; data?: T };
    return body?.data ?? null;
  } catch {
    // Timeout, DNS/connection error, JSON parse error, aborted, etc.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Guarded POST against analytics-service. Returns the `data` field of the
 * standard `{ success, data }` envelope, or `null` on any failure.
 */
async function analyticsPost<T>(
  tenantId: string,
  path: string,
  payload: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  authHeader?: string
): Promise<T | null> {
  // The analytics query endpoint is JWT-guarded (requirePermission + tenant from
  // the token), so forward the caller's bearer when we have it; fall back to the
  // internal service token for endpoints that accept it.
  const authorization =
    authHeader && authHeader.trim().length > 0
      ? authHeader
      : `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${analyticsBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { success?: boolean; data?: T };
    return body?.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  [key: string]: unknown;
}

/**
 * Execute a ReportSpec against analytics-service's `POST /query` endpoint.
 * Fail-open: returns `null` if analytics is unavailable or the endpoint is not
 * yet deployed, so a report "run" degrades gracefully instead of throwing.
 */
export function runReportSpec(
  tenantId: string,
  spec: unknown,
  authHeader?: string
): Promise<QueryResult | null> {
  // analytics-service's POST /query expects the bare ReportSpec as the body and
  // authenticates the caller's JWT (deriving tenant from it), so forward the
  // incoming Authorization header rather than the internal service token.
  return analyticsPost<QueryResult>(tenantId, '/query', spec, DEFAULT_TIMEOUT_MS, authHeader);
}

export interface PipelineSummary {
  totalDeals: number;
  totalValue: number;
  avgDealSize: number;
  avgDaysInPipeline: number;
}

export interface RevenueSummary {
  totalRevenue: number;
  wonAmount?: number;
  wonDeals: number;
  lostDeals: number;
  winRate: number;
  winRatePct?: number;
  avgSalePrice: number;
}

export interface RevenueByRep {
  ownerId: string;
  totalRevenue: number;
  wonDeals: number;
  winRate: number;
}

export interface ActivitySummary {
  [key: string]: unknown;
}

export interface ForecastData {
  weightedPipeline: string;
  totalPipeline: string;
  winRatePct: number;
  winRate?: number;
  forecastByMonth: Array<{ month: string; weighted: string; total: string }>;
}

export const analyticsClient = {
  getPipelineSummary(tenantId: string, pipelineId?: string): Promise<PipelineSummary | null> {
    return analyticsGet<PipelineSummary>(tenantId, '/pipeline/summary', { pipelineId });
  },

  getRevenueSummary(
    tenantId: string,
    period: { year: number; quarter?: number }
  ): Promise<RevenueSummary | null> {
    return analyticsGet<RevenueSummary>(tenantId, '/revenue/summary', {
      year: period.year,
      quarter: period.quarter,
    });
  },

  getRevenueByRep(
    tenantId: string,
    period: { year: number; quarter?: number }
  ): Promise<RevenueByRep[] | null> {
    return analyticsGet<RevenueByRep[]>(tenantId, '/revenue/by-rep', {
      year: period.year,
      quarter: period.quarter,
    });
  },

  getActivitySummary(tenantId: string): Promise<ActivitySummary | null> {
    return analyticsGet<ActivitySummary>(tenantId, '/activities/summary');
  },

  getForecast(tenantId: string): Promise<ForecastData | null> {
    return analyticsGet<ForecastData>(tenantId, '/forecast/weighted-pipeline');
  },
};
