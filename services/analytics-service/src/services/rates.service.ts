/**
 * Currency conversion helper for analytics roll-ups.
 *
 * Deal / quote / invoice events arrive in mixed currencies. To make pipeline,
 * revenue and forecast roll-ups currency-correct, we convert every amount to the
 * tenant's base currency before it is projected into the ClickHouse read-models.
 *
 * Rates + the base currency are fetched from finance-service and cached in memory
 * with a TTL so we do NOT call finance on every event.
 *
 * GUARANTEE: this module NEVER throws. If finance is unreachable, rates are
 * missing, or the currency already equals the base currency, we fall back to a
 * 1:1 conversion (baseAmount = amount) and log a warning. A missing rate must
 * never lose or block an event.
 */

const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const CACHE_TTL_MS = Number(process.env.ANALYTICS_RATES_TTL_MS ?? 10 * 60 * 1000); // 10 min
const FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_BASE_CURRENCY = (process.env.ANALYTICS_DEFAULT_BASE_CURRENCY ?? 'USD').toUpperCase();

export interface ConvertResult {
  /** amount expressed in the tenant base currency */
  baseAmount: number;
  /** the tenant base currency code, e.g. "USD" */
  baseCurrency: string;
}

interface TenantRates {
  baseCurrency: string;
  /** rate map: fromCurrency (uppercased) -> multiplier to convert INTO base currency */
  toBase: Record<string, number>;
  fetchedAt: number;
}

interface FinanceCurrencyRow {
  code?: string;
  isBase?: boolean;
  isActive?: boolean;
}

interface FinanceExchangeRateRow {
  fromCurrency?: string;
  toCurrency?: string;
  rate?: number | string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

/**
 * Tiny structured logger. Analytics uses fastify's pino logger elsewhere, but the
 * consumer/projection layer has no request context, so we log to stderr directly
 * and keep it non-fatal. We rate-limit warnings so a finance outage does not spam.
 */
const lastWarnAt = new Map<string, number>();
function warnOnce(key: string, message: string, meta?: Record<string, unknown>): void {
  const now = Date.now();
  const prev = lastWarnAt.get(key) ?? 0;
  if (now - prev < 60_000) return; // at most one warning per key per minute
  lastWarnAt.set(key, now);
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({ level: 'warn', service: 'analytics-service', component: 'rates', message, ...meta })
  );
}

/**
 * Pure conversion: apply an already-resolved rate table to a single amount.
 * Shared by the per-row {@link RatesService.convertToBase} and the batched
 * {@link RatesService.getConverter} so both paths behave identically. Never throws.
 */
function applyRates(
  rates: TenantRates | undefined,
  tenantId: string,
  amount: number,
  currency: string
): ConvertResult {
  const amt = Number.isFinite(amount) ? amount : 0;
  const from = (currency || DEFAULT_BASE_CURRENCY).toUpperCase();

  if (!rates) {
    // No rates available at all -> 1:1, base currency unknown, echo source currency.
    return { baseAmount: amt, baseCurrency: from };
  }

  const base = rates.baseCurrency;
  if (from === base) {
    return { baseAmount: amt, baseCurrency: base };
  }

  const rate = rates.toBase[from];
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
    return { baseAmount: amt * rate, baseCurrency: base };
  }

  // Rate missing for this currency pair -> 1:1 into base, keep the event.
  warnOnce(`missingrate:${tenantId}:${from}`, 'Missing exchange rate; using 1:1 fallback', {
    tenantId,
    from,
    base,
  });
  return { baseAmount: amt, baseCurrency: base };
}

export class RatesService {
  private cache = new Map<string, TenantRates>();
  /** de-dupe concurrent fetches for the same tenant */
  private inflight = new Map<string, Promise<TenantRates>>();

  /**
   * Convert `amount` (given in `currency`) into the tenant's base currency.
   * Always resolves — never throws. Falls back to 1:1 on any failure.
   */
  async convertToBase(tenantId: string, amount: number, currency: string): Promise<ConvertResult> {
    const rates = await this.resolveRates(tenantId);
    return applyRates(rates, tenantId, amount, currency);
  }

  /**
   * Resolve the tenant's rate table ONCE and return a synchronous converter for
   * reuse across many rows in a single request/batch.
   *
   * This is the batched alternative to calling {@link convertToBase} per row: a
   * forecast / rebuild path that converts N deals otherwise awaits N times (an
   * N+1 of async hops, each re-reading the cache). Here the FX rates are fetched
   * a single time up front and every subsequent conversion is a pure in-memory
   * lookup keyed by currency — no per-deal await. Behaviour (including the 1:1
   * fallbacks and missing-rate warnings) is identical to `convertToBase`.
   */
  async getConverter(
    tenantId: string
  ): Promise<(amount: number, currency: string) => ConvertResult> {
    const rates = await this.resolveRates(tenantId);
    return (amount: number, currency: string): ConvertResult =>
      applyRates(rates, tenantId, amount, currency);
  }

  /** Load rates, swallowing any error into `undefined` (→ 1:1 fallback). Never throws. */
  private async resolveRates(tenantId: string): Promise<TenantRates | undefined> {
    try {
      return await this.getRates(tenantId);
    } catch (err) {
      // getRates is already guarded, but belt-and-suspenders: never propagate.
      warnOnce(`getrates:${tenantId}`, 'Failed to load exchange rates; using 1:1 fallback', {
        tenantId,
        error: (err as Error)?.message,
      });
      return undefined;
    }
  }

  /** Returns cached rates when fresh; otherwise fetches (de-duped) from finance. */
  private async getRates(tenantId: string): Promise<TenantRates> {
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached;
    }

    const existing = this.inflight.get(tenantId);
    if (existing) return existing;

    const promise = this.fetchRates(tenantId, cached)
      .then((rates) => {
        this.cache.set(tenantId, rates);
        return rates;
      })
      .finally(() => {
        this.inflight.delete(tenantId);
      });

    this.inflight.set(tenantId, promise);
    return promise;
  }

  /**
   * Fetch currencies + exchange rates from finance-service. Guarded: on ANY
   * error returns a stale cache entry if present, else a safe empty ruleset that
   * yields 1:1 conversions.
   */
  private async fetchRates(tenantId: string, stale?: TenantRates): Promise<TenantRates> {
    const fallback: TenantRates =
      stale ?? { baseCurrency: DEFAULT_BASE_CURRENCY, toBase: {}, fetchedAt: 0 };

    try {
      const [currencies, exchangeRates] = await Promise.all([
        this.fetchJson<FinanceCurrencyRow[]>(`/api/v1/currencies`, tenantId),
        this.fetchJson<FinanceExchangeRateRow[]>(`/api/v1/exchange-rates`, tenantId),
      ]);

      const baseCurrency =
        currencies.find((c) => c?.isBase)?.code?.toUpperCase() ?? DEFAULT_BASE_CURRENCY;

      const toBase: Record<string, number> = {};
      const now = Date.now();
      // Keep the most recent effective rate per fromCurrency that targets the base.
      const seenAt: Record<string, number> = {};
      for (const r of exchangeRates) {
        const to = (r?.toCurrency ?? '').toUpperCase();
        const fromC = (r?.fromCurrency ?? '').toUpperCase();
        if (!fromC || to !== baseCurrency) continue;
        const rate = Number(r?.rate);
        if (!Number.isFinite(rate) || rate <= 0) continue;
        // Respect effective window when provided.
        const effFrom = r?.effectiveFrom ? Date.parse(r.effectiveFrom) : Number.NEGATIVE_INFINITY;
        const effTo = r?.effectiveTo ? Date.parse(r.effectiveTo) : Number.POSITIVE_INFINITY;
        if (Number.isFinite(effFrom) && effFrom > now) continue;
        if (Number.isFinite(effTo) && effTo < now) continue;
        const effRank = Number.isFinite(effFrom) ? effFrom : 0;
        if (seenAt[fromC] === undefined || effRank >= seenAt[fromC]) {
          toBase[fromC] = rate;
          seenAt[fromC] = effRank;
        }
      }

      return { baseCurrency, toBase, fetchedAt: Date.now() };
    } catch (err) {
      warnOnce(`fetch:${tenantId}`, 'finance-service rates fetch failed; using fallback', {
        tenantId,
        financeUrl: FINANCE_SERVICE_URL,
        error: (err as Error)?.message,
      });
      // Return stale (if any) so we keep converting; else empty -> 1:1.
      return { ...fallback, fetchedAt: Date.now() };
    }
  }

  private async fetchJson<T>(path: string, tenantId: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${FINANCE_SERVICE_URL}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${INTERNAL_SERVICE_TOKEN}`,
          'x-service-token': INTERNAL_SERVICE_TOKEN,
          'x-tenant-id': tenantId,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`finance ${path} -> ${res.status}`);
      }
      const body = (await res.json()) as { success?: boolean; data?: T } | T;
      // finance-service wraps responses as { success, data }
      if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
        return (body as { data: T }).data;
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Shared singleton so the in-memory cache is reused across all projections. */
export const ratesService = new RatesService();
