/**
 * Currency conversion helper for CRM forecast roll-ups.
 *
 * Deal amounts are stored with a raw per-deal currency. To make stage / rep /
 * category forecast totals currency-correct, we convert every deal amount to the
 * tenant's base currency before summing.
 *
 * Rates + the base currency are fetched from finance-service and cached in
 * memory with a TTL so we do NOT call finance on every request.
 *
 * GUARANTEE: this module NEVER throws. If finance is unreachable, rates are
 * missing, or the currency already equals the base currency, we fall back to a
 * 1:1 conversion (baseAmount = amount) and log a rate-limited warning. A rates
 * hiccup must never break a forecast endpoint.
 *
 * This mirrors analytics-service/src/services/rates.service.ts; it is kept as a
 * small in-service helper (no new shared package) to match the audit guidance.
 */

const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const CACHE_TTL_MS = Number(process.env.CRM_RATES_TTL_MS ?? 10 * 60 * 1000); // 10 min
const FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_BASE_CURRENCY = (process.env.CRM_DEFAULT_BASE_CURRENCY ?? 'USD').toUpperCase();

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

/** Rate-limited stderr warn so a finance outage does not spam logs. */
const lastWarnAt = new Map<string, number>();
function warnOnce(key: string, message: string, meta?: Record<string, unknown>): void {
  const now = Date.now();
  const prev = lastWarnAt.get(key) ?? 0;
  if (now - prev < 60_000) return; // at most one warning per key per minute
  lastWarnAt.set(key, now);
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({ level: 'warn', service: 'crm-service', component: 'currency', message, ...meta })
  );
}

export class RatesService {
  private cache = new Map<string, TenantRates>();
  /** de-dupe concurrent fetches for the same tenant */
  private inflight = new Map<string, Promise<TenantRates>>();

  /**
   * Resolve the tenant base currency without a specific amount. Never throws;
   * falls back to DEFAULT_BASE_CURRENCY on any failure.
   */
  async getBaseCurrency(tenantId: string): Promise<string> {
    try {
      const rates = await this.getRates(tenantId);
      return rates.baseCurrency;
    } catch {
      return DEFAULT_BASE_CURRENCY;
    }
  }

  /**
   * Convert `amount` (given in `currency`) into the tenant's base currency.
   * Always resolves — never throws. Falls back to 1:1 on any failure.
   */
  async convertToBase(tenantId: string, amount: number, currency: string): Promise<ConvertResult> {
    const amt = Number.isFinite(amount) ? amount : 0;
    const from = (currency || DEFAULT_BASE_CURRENCY).toUpperCase();

    let rates: TenantRates | undefined;
    try {
      rates = await this.getRates(tenantId);
    } catch (err) {
      warnOnce(`getrates:${tenantId}`, 'Failed to load exchange rates; using 1:1 fallback', {
        tenantId,
        error: (err as Error)?.message,
      });
      rates = undefined;
    }

    if (!rates) {
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

    // Rate missing for this currency pair -> 1:1 into base, keep the amount.
    warnOnce(`missingrate:${tenantId}:${from}`, 'Missing exchange rate; using 1:1 fallback', {
      tenantId,
      from,
      base,
    });
    return { baseAmount: amt, baseCurrency: base };
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
      const seenAt: Record<string, number> = {};
      for (const r of exchangeRates) {
        const to = (r?.toCurrency ?? '').toUpperCase();
        const fromC = (r?.fromCurrency ?? '').toUpperCase();
        if (!fromC || to !== baseCurrency) continue;
        const rate = Number(r?.rate);
        if (!Number.isFinite(rate) || rate <= 0) continue;
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
      if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
        return (body as { data: T }).data;
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Shared singleton so the in-memory cache is reused across all requests. */
export const ratesService = new RatesService();
