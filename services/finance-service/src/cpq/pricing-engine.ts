import { Decimal } from 'decimal.js';
import type {
  CpqLineItem,
  CpqPricingRequest,
  CpqPricingResult,
} from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import {
  Prisma,
  type PrismaClient,
  type Product as PrismaProduct,
  type PriceTier as PrismaPriceTier,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';

/** Accepts either the raw Prisma client or the tenant-isolated extended client. */
export type EnginePrisma = PrismaClient | FinancePrisma;

/**
 * Locally-extended pricing request. The shared `CpqPricingRequest` type lives
 * in `@nexus/shared-types` (which this service does not own); the flagship CPQ
 * features are threaded through as *optional* extras so callers that omit them
 * behave exactly as before.
 */
export type CpqPricingRequestEx = CpqPricingRequest & {
  /** Price Books — when present, `PriceBookEntry` prices override list price (Rule 1). */
  priceBookId?: string | null;
};

/**
 * Locally-extended pricing result. Adds margin + multi-currency fields that are
 * only populated when the corresponding inputs/config exist. Consumers read
 * these off the base result defensively.
 */
export type CpqPricingResultEx = CpqPricingResult & {
  /** Total margin (revenue − cost) in quote currency; undefined when no cost data. */
  marginTotal?: number;
  /** Total margin as a percentage of revenue; undefined when no cost data. */
  marginPercent?: number;
  /** Tenant base currency, when it differs from the quote currency. */
  baseCurrency?: string;
  /** FX rate quoteCurrency → baseCurrency (defaults to 1 when unavailable). */
  exchangeRate?: number;
  /** Quote `total` converted into the base currency. */
  baseTotal?: number;
  /** Echo of the price book actually used, when resolved. */
  priceBookId?: string;
};

/**
 * CPQ Pricing Engine — Section 40.
 *
 * Applies the 10-rule pricing waterfall in strict priority order:
 *
 *   1. List Price          — baseline from product catalog.
 *   2. Customer Tier       — STRATEGIC 25% · ENTERPRISE 15% · MID_MARKET 10% · SMB 5%.
 *   3. Volume Discount     — quantity-based price tiers.
 *   4. Bundle Discount     — additive discount when a required bundle is fully in the cart.
 *   5. Promotional Code    — DB-backed promo codes (validity window, redemption cap,
 *                            product allow-list).
 *   6. Competitive         — per-line competitive override (meet/beat).
 *   7. Floor Price         — hard minimum; working price is clamped upward and a warning
 *                            is surfaced so reps see what happened.
 *   8. Non-Standard        — manual override below the floored working price; when
 *                            applied, flips `approvalRequired = true`.
 *   9. Payment Terms       — additional 2% discount for `NET_0` / `PREPAID`.
 *  10. Free Items          — BOGO / add-on free items appended to the quote.
 *
 * All monetary arithmetic uses `decimal.js` — no native JS floating point.
 */

// ─── Internal types ─────────────────────────────────────────────────────────

/**
 * Structured shape of the JSON-stored per-product rules. Prisma stores the
 * column as `Json`; we narrow it at read time.
 */
interface PricingRule {
  type: 'TIER' | 'BUNDLE' | 'FLOOR' | 'BOGO' | 'PROMO' | string;
  discountPercent?: number;
  discountFlat?: number;
  /** Used by `BUNDLE` — all of these product IDs must be in the cart. */
  requiredProducts?: string[];
  /** Used by `FLOOR` — per-tier floor with a `DEFAULT` fallback key. */
  floors?: Record<string, number>;
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
}

interface PriceTier {
  minQty: number;
  maxQty: number | null;
  unitPrice: Decimal;
}

/** Engine-internal shape of a `PriceBookEntry` row used for Rule-1 override. */
interface PriceBookEntryRow {
  minQty: number;
  unitPrice: Decimal;
  discountPct: number;
}

/** Engine-internal product shape after Prisma → domain conversion. */
interface ProductWithTiers {
  id: string;
  sku: string;
  name: string;
  listPrice: Decimal;
  billingType: string;
  taxable: boolean;
  pricingRules: PricingRule[];
  priceTiers: PriceTier[];
}

interface AccountPricingContext {
  /** STRATEGIC · ENTERPRISE · MID_MARKET · SMB (matches `Account.tier`). */
  tier: string;
  totalRevenue: Decimal;
  /** Per-productId negotiated discount %. Reserved for future pre-approved overrides. */
  negotiatedRates: Record<string, number>;
}

const TIER_DISCOUNTS: Record<string, number> = {
  STRATEGIC: 25,
  ENTERPRISE: 15,
  MID_MARKET: 10,
  SMB: 5,
};

/** Rule 9 — flat early-payment discount. */
const EARLY_PAYMENT_DISCOUNT_PERCENT = 2;
const DEFAULT_TAX_RATE = 0.1;

/**
 * Margin-floor guardrail. When the priced quote's total margin % falls below
 * this threshold, `approvalRequired` is flipped (mirrors the floor-price rule).
 * Configurable via `MIN_MARGIN_PCT`; defaults to 10%.
 */
function getMinMarginPct(): number {
  const raw = Number(process.env.MIN_MARGIN_PCT);
  return Number.isFinite(raw) ? raw : 10;
}

// ─── Type guards ────────────────────────────────────────────────────────────

/** Defensive narrow of `Product.pricingRules` from `Prisma.JsonValue` → `PricingRule[]`. */
function parsePricingRules(json: Prisma.JsonValue | null): PricingRule[] {
  if (!Array.isArray(json)) return [];
  const out: PricingRule[] = [];
  for (const entry of json) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      const type = record.type;
      if (typeof type !== 'string') continue;
      const rule: PricingRule = { type };
      if (typeof record.discountPercent === 'number')
        rule.discountPercent = record.discountPercent;
      if (typeof record.discountFlat === 'number')
        rule.discountFlat = record.discountFlat;
      if (Array.isArray(record.requiredProducts)) {
        rule.requiredProducts = record.requiredProducts.filter(
          (x): x is string => typeof x === 'string'
        );
      }
      if (
        record.floors &&
        typeof record.floors === 'object' &&
        !Array.isArray(record.floors)
      ) {
        const floors: Record<string, number> = {};
        for (const [k, v] of Object.entries(
          record.floors as Record<string, unknown>
        )) {
          if (typeof v === 'number') floors[k] = v;
        }
        rule.floors = floors;
      }
      if (Array.isArray(record.conditions)) {
        rule.conditions = record.conditions
          .filter(
            (c): c is Record<string, unknown> =>
              c !== null && typeof c === 'object' && !Array.isArray(c)
          )
          .map((c) => ({
            field: String(c.field ?? ''),
            operator: String(c.operator ?? ''),
            value: c.value,
          }));
      }
      out.push(rule);
    }
  }
  return out;
}

/** Converts a Prisma `Product` (with `priceTiers`) into the engine's domain shape. */
function toProductWithTiers(
  row: PrismaProduct & { priceTiers: PrismaPriceTier[] }
): ProductWithTiers {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    listPrice: new Decimal(row.listPrice.toString()),
    billingType: row.billingType,
    taxable: row.taxable,
    pricingRules: parsePricingRules(row.pricingRules),
    priceTiers: row.priceTiers.map((t) => ({
      minQty: t.minQty,
      maxQty: t.maxQty,
      unitPrice: new Decimal(t.unitPrice.toString()),
    })),
  };
}

function toDecimal(value: number | string | Prisma.Decimal | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  return new Decimal(value.toString());
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class CpqPricingEngine {
  constructor(private readonly prisma: EnginePrisma) {}

  /**
   * Runs the full 10-rule waterfall for the given request and returns the priced
   * quote with totals and audit trail.
   *
   * @throws {NotFoundError} When any requested product does not exist / is inactive
   *                         for the given tenant.
   */
  async calculate(req: CpqPricingRequestEx): Promise<CpqPricingResultEx> {
    // ── Load products + tiers in one query ─────────────────────────────────
    const productIds = req.items.map((i) => i.productId);
    const rawProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.tenantId, isActive: true },
      include: { priceTiers: true },
    });
    const productMap = new Map<string, ProductWithTiers>(
      rawProducts.map((p) => [p.id, toProductWithTiers(p)])
    );

    // ── Price Books (feature 1) ────────────────────────────────────────────
    // When a price book is supplied, load its entries so Rule-1 list price can
    // be overridden per (product, qty tier). Absent/unresolved → falls back to
    // Product.listPrice, i.e. exactly the previous behaviour.
    const priceBookId = req.priceBookId ?? null;
    let resolvedPriceBookId: string | undefined;
    const priceBookEntries = new Map<string, PriceBookEntryRow[]>();
    if (priceBookId) {
      const book = await this.prisma.priceBook.findFirst({
        where: { id: priceBookId, tenantId: req.tenantId, isActive: true },
        select: { id: true },
      });
      if (book) {
        resolvedPriceBookId = book.id;
        const entries = await this.prisma.priceBookEntry.findMany({
          where: {
            tenantId: req.tenantId,
            priceBookId: book.id,
            productId: { in: productIds },
          },
        });
        for (const entry of entries) {
          const list = priceBookEntries.get(entry.productId) ?? [];
          list.push({
            minQty: entry.minQty,
            unitPrice: new Decimal(entry.unitPrice.toString()),
            discountPct: entry.discountPct,
          });
          priceBookEntries.set(entry.productId, list);
        }
      }
    }

    // ── Cost data for margin (feature 2) ───────────────────────────────────
    // Preferred cost is the preferred/active VendorProduct.costPrice; otherwise
    // Product.cost. Missing cost → line contributes no margin (undefined).
    const costMap = await this.loadCostMap(req.tenantId, productIds, productMap);
    let marginable = false;
    let costTotal = new Decimal(0);

    // ── Load account pricing context ───────────────────────────────────────
    const account = await this.prisma.account.findFirst({
      where: { id: req.accountId, tenantId: req.tenantId },
    });
    const accountCtx: AccountPricingContext = {
      tier: account?.tier ?? 'SMB',
      totalRevenue: toDecimal(account?.annualRevenue),
      negotiatedRates: {},
    };

    const lineItems: CpqLineItem[] = [];
    const appliedRules: string[] = [];
    const floorWarnings: string[] = [];
    let approvalRequired = false;
    const approvalReasons: string[] = [];

    for (const reqItem of req.items) {
      const product = productMap.get(reqItem.productId);
      if (!product) {
        throw new NotFoundError('Product', reqItem.productId);
      }

      const qty = reqItem.quantity;
      // ── Rule 1: List Price baseline ───────────────────────────────────────
      // Price book entry (when present) overrides the catalog list price.
      const listPrice = this.resolveListPrice(
        product,
        priceBookEntries.get(product.id),
        qty
      );
      let discountPercent = new Decimal(0);

      // ── Rule 2: Customer Tier Discount ────────────────────────────────────
      const tierDiscount = new Decimal(TIER_DISCOUNTS[accountCtx.tier] ?? 0);
      if (tierDiscount.gt(0)) {
        discountPercent = discountPercent.plus(tierDiscount);
        appliedRules.push(
          `Tier discount (${accountCtx.tier}): -${tierDiscount.toFixed(2)}%`
        );
      }

      // ── Rule 3: Volume / Price Tier ───────────────────────────────────────
      const tierPrice = this.getVolumeTierPrice(product.priceTiers, qty);
      if (tierPrice && tierPrice.lt(listPrice)) {
        const volDiscount = listPrice
          .minus(tierPrice)
          .div(listPrice)
          .times(100);
        // COM-03: the volume tier is an absolute price floor/replacement, not an
        // additive discount. Stacking it on top of the customer-tier discount
        // double-discounts the customer. Take whichever yields the better (lower)
        // price — i.e. the deeper discount — instead of summing both percentages.
        if (volDiscount.gt(discountPercent)) {
          discountPercent = volDiscount;
          appliedRules.push(
            `Volume tier (qty ${qty}): -${volDiscount.toFixed(2)}%`
          );
        }
      }

      // ── Rule 4: Bundle Discount ───────────────────────────────────────────
      const bundleDiscount = this.checkBundleDiscount(
        product.id,
        productIds,
        product.pricingRules
      );
      if (bundleDiscount > 0) {
        discountPercent = discountPercent.plus(bundleDiscount);
        appliedRules.push(`Bundle discount: -${bundleDiscount}%`);
      }

      // ── Rule 5: Promotional Code ──────────────────────────────────────────
      if (req.appliedPromos && req.appliedPromos.length > 0) {
        const promoDiscount = await this.getPromoDiscount(
          req.tenantId,
          req.appliedPromos,
          product.id
        );
        if (promoDiscount > 0) {
          discountPercent = discountPercent.plus(promoDiscount);
          appliedRules.push(`Promo code: -${promoDiscount}%`);
          // RR-H9: promo redemption (uses++) is committed ONLY at order commit
          // (quote → order conversion), never on preview/calculate. See
          // `commitPromoRedemptions` in commercial-records.use-case.ts.
        }
      }

      // ── Rule 6: Competitive Pricing ───────────────────────────────────────
      if (reqItem.competitiveOverridePrice !== undefined) {
        const compPrice = toDecimal(reqItem.competitiveOverridePrice);
        if (compPrice.lt(listPrice)) {
          const compDiscount = listPrice
            .minus(compPrice)
            .div(listPrice)
            .times(100);
          // Competitive is meet-or-beat → *replace* accumulated discount if it's
          // deeper than anything we've already stacked.
          if (compDiscount.gt(discountPercent)) {
            discountPercent = compDiscount;
            appliedRules.push(
              `Competitive pricing: -${compDiscount.toFixed(2)}%`
            );
          }
        }
      }

      // COM-01: cap the cumulative discount at 100% so stacked discounts can
      // never invert the price. All arithmetic stays in Decimal (decimal.js).
      if (discountPercent.gt(100)) discountPercent = new Decimal(100);
      if (discountPercent.lt(0)) discountPercent = new Decimal(0);

      // Apply accumulated discount to obtain the post-rules-1..6 working price.
      let workingPrice = listPrice.times(
        new Decimal(1).minus(discountPercent.div(100))
      );
      // COM-01: floor the resulting unit price at >= 0 as a final safety net.
      if (workingPrice.lt(0)) workingPrice = new Decimal(0);

      // ── Rule 7: Floor Price Enforcement ───────────────────────────────────
      const floorPrice = this.getFloorPrice(product, accountCtx.tier);
      if (floorPrice && workingPrice.lt(floorPrice)) {
        floorWarnings.push(
          `${product.name}: price floored at ${req.currency} ${floorPrice.toFixed(2)}`
        );
        workingPrice = floorPrice;
        discountPercent = listPrice
          .minus(workingPrice)
          .div(listPrice)
          .times(100);
      }

      // ── Rule 8: Non-Standard Approval ─────────────────────────────────────
      // A manual override is a *deliberate* sub-floor concession that flips
      // approvalRequired — it is the one path allowed below the floor, so the
      // Rule-9 re-clamp below must NOT undo it.
      let manualOverrideApplied = false;
      if (reqItem.manualOverridePrice !== undefined) {
        const overridePrice = toDecimal(reqItem.manualOverridePrice);
        if (overridePrice.lt(workingPrice)) {
          workingPrice = overridePrice;
          discountPercent = listPrice
            .minus(workingPrice)
            .div(listPrice)
            .times(100);
          approvalRequired = true;
          manualOverrideApplied = true;
          approvalReasons.push(
            `Non-standard price override on ${product.name}`
          );
          appliedRules.push(
            `Manual override on ${product.name}: ${req.currency} ${overridePrice.toFixed(2)}`
          );
        }
      }

      // ── Rule 9: Payment Terms Discount ────────────────────────────────────
      if (req.paymentTerms === 'NET_0' || req.paymentTerms === 'PREPAID') {
        const payDiscount = new Decimal(EARLY_PAYMENT_DISCOUNT_PERCENT);
        workingPrice = workingPrice.times(
          new Decimal(1).minus(payDiscount.div(100))
        );
        discountPercent = listPrice
          .minus(workingPrice)
          .div(listPrice)
          .times(100);
        appliedRules.push(
          `Early payment (${req.paymentTerms}): -${payDiscount.toFixed(2)}%`
        );
      }

      // ── Floor re-enforcement (post Rule 9) ────────────────────────────────
      // The Rule-9 early-payment multiplier is applied AFTER the Rule-7 floor
      // clamp, so a working price sitting exactly at the floor would be pushed
      // ~2% below it with no guard. Re-clamp to the floor here (unless a manual
      // override already carried this line below the floor under approval).
      if (floorPrice && !manualOverrideApplied && workingPrice.lt(floorPrice)) {
        floorWarnings.push(
          `${product.name}: price re-floored at ${req.currency} ${floorPrice.toFixed(2)} after payment-term discount`
        );
        workingPrice = floorPrice;
        discountPercent = listPrice
          .minus(workingPrice)
          .div(listPrice)
          .times(100);
      }

      const discountAmount = listPrice.minus(workingPrice);
      const total = workingPrice.times(qty);

      // ── Margin (feature 2) ────────────────────────────────────────────────
      const unitCost = costMap.get(product.id);
      if (unitCost) {
        marginable = true;
        costTotal = costTotal.plus(unitCost.times(qty));
      }

      lineItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        listPrice: listPrice.toNumber(),
        unitPrice: workingPrice.toNumber(),
        discountPercent: discountPercent.toNumber(),
        discountAmount: discountAmount.toNumber(),
        total: total.toNumber(),
        taxPercent: 0,
        taxAmount: 0,
        billingType: product.billingType,
      });
    }

    // ── Rule 10: Free Items ──────────────────────────────────────────────────
    const freeItems = this.computeFreeItems(req.items, lineItems, productMap);
    if (freeItems.length > 0) {
      lineItems.push(...freeItems);
      appliedRules.push(
        `Free items added: ${freeItems.map((f) => f.productName).join(', ')}`
      );
    }

    // ── Totals ───────────────────────────────────────────────────────────────
    const subtotal = lineItems.reduce(
      (sum, i) => sum.plus(new Decimal(i.total)),
      new Decimal(0)
    );
    const discountTotal = lineItems.reduce(
      (sum, i) => sum.plus(new Decimal(i.discountAmount).times(i.quantity)),
      new Decimal(0)
    );
    const taxRate = await this.resolveTaxRate(req.tenantId, account);

    // Stamp per-line tax now that taxRate is known
    for (const item of lineItems) {
      const taxable = productMap.get(item.productId)?.taxable ?? false;
      item.taxPercent = taxable ? taxRate * 100 : 0;
      item.taxAmount = taxable ? new Decimal(item.total).times(taxRate).toNumber() : 0;
    }

    const taxTotal = lineItems.reduce(
      (sum, i) => sum.plus(new Decimal(i.taxAmount)),
      new Decimal(0)
    );

    const total = subtotal.plus(taxTotal);

    // ── Margin totals + floor guardrail (feature 2) ──────────────────────────
    // Revenue basis for margin is the pre-tax subtotal (sum of line totals).
    let marginTotal: number | undefined;
    let marginPercent: number | undefined;
    if (marginable) {
      const marginDec = subtotal.minus(costTotal);
      marginTotal = marginDec.toNumber();
      const marginPctDec = subtotal.gt(0)
        ? marginDec.div(subtotal).times(100)
        : new Decimal(0);
      marginPercent = marginPctDec.toNumber();

      const minMarginPct = getMinMarginPct();
      if (marginPctDec.lt(minMarginPct)) {
        approvalRequired = true;
        approvalReasons.push(
          `Total margin ${marginPctDec.toFixed(2)}% is below the ${minMarginPct}% floor`
        );
      }
    }

    // ── Multi-currency (feature 3) ───────────────────────────────────────────
    // When the quote currency differs from the tenant base currency, convert
    // the total using the active ExchangeRate. Missing rate → 1:1 + warning.
    let baseCurrency: string | undefined;
    let exchangeRate: number | undefined;
    let baseTotal: number | undefined;
    const fx = await this.resolveBaseCurrencyConversion(
      req.tenantId,
      req.currency,
      total
    );
    if (fx) {
      baseCurrency = fx.baseCurrency;
      exchangeRate = fx.rate.toNumber();
      baseTotal = fx.baseTotal.toNumber();
      if (fx.warning) floorWarnings.push(fx.warning);
    }

    return {
      items: lineItems,
      subtotal: subtotal.toNumber(),
      discountTotal: discountTotal.toNumber(),
      taxTotal: taxTotal.toNumber(),
      total: total.toNumber(),
      appliedRules: [...new Set(appliedRules)],
      floorPriceWarnings: floorWarnings,
      approvalRequired,
      approvalReasons,
      marginTotal,
      marginPercent,
      baseCurrency,
      exchangeRate,
      baseTotal,
      priceBookId: resolvedPriceBookId,
    };
  }

  /**
   * Resolves the active tax rate for a quote by *jurisdiction*, in priority
   * order:
   *
   *   1. The account's explicit `taxZoneId` — deepest match; prefers the zone's
   *      `isDefault` rate, else any active rate in that zone.
   *   2. The account's `country` — joined to `TaxZone.country`, then the zone's
   *      default/active rate.
   *   3. The tenant's global `isDefault` TaxRate.
   *   4. `DEFAULT_TAX_RATE` (0.1) when nothing is configured.
   *
   * Previously only step 3 existed, so every account was taxed at the single
   * default rate and `TaxZone.country` was never consulted. Fully guarded so a
   * client without the `taxRate`/`taxZone` delegates (e.g. unit-test mocks) falls
   * straight through to the default.
   */
  private async resolveTaxRate(
    tenantId: string,
    account: { taxZoneId?: string | null; country?: string | null } | null
  ): Promise<number> {
    if (!('taxRate' in this.prisma) || !this.prisma.taxRate) {
      return DEFAULT_TAX_RATE;
    }

    // 1. Account's explicit tax zone.
    const zoneId = account?.taxZoneId ?? null;
    if (zoneId) {
      const zoneRate = await this.prisma.taxRate.findFirst({
        where: { tenantId, zoneId, isActive: true },
        orderBy: { isDefault: 'desc' },
        select: { rate: true },
      });
      if (zoneRate) return Number(zoneRate.rate);
    }

    // 2. Account's country → TaxZone.country join.
    const country = account?.country ?? null;
    if (country && 'taxZone' in this.prisma && this.prisma.taxZone) {
      const zone = await this.prisma.taxZone.findFirst({
        where: { tenantId, country, isActive: true },
        select: {
          rates: {
            where: { isActive: true },
            orderBy: { isDefault: 'desc' },
            take: 1,
            select: { rate: true },
          },
        },
      });
      const rate = zone?.rates?.[0]?.rate;
      if (rate !== undefined && rate !== null) return Number(rate);
    }

    // 3. Tenant-wide default rate.
    const defaultRate = await this.prisma.taxRate.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
      select: { rate: true },
    });
    if (defaultRate) return Number(defaultRate.rate);

    // 4. Hardcoded fallback.
    return DEFAULT_TAX_RATE;
  }

  // ─── Private rule helpers ─────────────────────────────────────────────────

  /**
   * Rule 1 (feature 1) — resolves the list-price baseline. When a price book
   * entry applies to `(product, qty)`, its unit price (net of any `discountPct`)
   * replaces `Product.listPrice`. Picks the deepest applicable `minQty` tier.
   * Falls back to the catalog list price when no entry matches.
   */
  private resolveListPrice(
    product: ProductWithTiers,
    entries: PriceBookEntryRow[] | undefined,
    qty: number
  ): Decimal {
    if (!entries || entries.length === 0) return product.listPrice;
    const matching = entries
      .filter((e) => qty >= e.minQty)
      .sort((a, b) => b.minQty - a.minQty);
    if (matching.length === 0) return product.listPrice;
    const entry = matching[0];
    let price = entry.unitPrice;
    if (entry.discountPct > 0) {
      price = price.times(new Decimal(1).minus(new Decimal(entry.discountPct).div(100)));
    }
    return price;
  }

  /**
   * Margin (feature 2) — resolves the per-unit cost for each product. Prefers
   * the preferred/active `VendorProduct.costPrice`, then any active vendor cost,
   * then `Product.cost`. Products with no cost data are omitted from the map so
   * margin computation stays additive/guarded.
   */
  private async loadCostMap(
    tenantId: string,
    productIds: string[],
    productMap: Map<string, ProductWithTiers>
  ): Promise<Map<string, Decimal>> {
    const costMap = new Map<string, Decimal>();
    if (productIds.length === 0) return costMap;

    const vendorProducts = await this.prisma.vendorProduct.findMany({
      where: { tenantId, productId: { in: productIds }, isActive: true },
      orderBy: { isPreferred: 'desc' },
    });
    for (const vp of vendorProducts) {
      // First write wins → preferred vendor (orderBy desc) takes precedence.
      if (!costMap.has(vp.productId)) {
        costMap.set(vp.productId, new Decimal(vp.costPrice.toString()));
      }
    }

    // Fall back to Product.cost where no vendor cost exists.
    for (const productId of productIds) {
      if (costMap.has(productId)) continue;
      const raw = productMap.get(productId);
      if (!raw) continue;
      const productCost = await this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { cost: true },
      });
      if (productCost?.cost !== null && productCost?.cost !== undefined) {
        costMap.set(productId, new Decimal(productCost.cost.toString()));
      }
    }
    return costMap;
  }

  /**
   * Multi-currency (feature 3) — when the quote currency differs from the
   * tenant base currency, converts `total` using the active `ExchangeRate`
   * (respecting `effectiveFrom`/`effectiveTo`). Returns `null` when there is no
   * distinct base currency to convert into. Never throws: a missing rate falls
   * back to 1:1 with a warning.
   */
  private async resolveBaseCurrencyConversion(
    tenantId: string,
    quoteCurrency: string,
    total: Decimal
  ): Promise<
    | { baseCurrency: string; rate: Decimal; baseTotal: Decimal; warning?: string }
    | null
  > {
    const baseRow = await this.prisma.currency.findFirst({
      where: { tenantId, isBase: true, isActive: true },
      select: { code: true },
    });
    const baseCurrency = baseRow?.code;
    if (!baseCurrency || baseCurrency === quoteCurrency) {
      return null;
    }

    const now = new Date();
    const rateRow = await this.prisma.exchangeRate.findFirst({
      where: {
        tenantId,
        fromCurrency: quoteCurrency,
        toCurrency: baseCurrency,
        effectiveFrom: { lte: now },
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!rateRow) {
      return {
        baseCurrency,
        rate: new Decimal(1),
        baseTotal: total,
        warning: `No exchange rate ${quoteCurrency}→${baseCurrency}; base total fell back to 1:1`,
      };
    }

    const rate = new Decimal(rateRow.rate.toString());
    return { baseCurrency, rate, baseTotal: total.times(rate) };
  }

  /**
   * Rule 3 — selects the matching `PriceTier` for `qty` (deepest tier first)
   * and returns its unit price, or `null` if no tier matches.
   */
  private getVolumeTierPrice(tiers: PriceTier[], qty: number): Decimal | null {
    const matching = tiers
      .filter(
        (t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty)
      )
      .sort((a, b) => b.minQty - a.minQty);
    return matching.length > 0 ? matching[0].unitPrice : null;
  }

  /**
   * Rule 4 — returns the bundle discount % when every `requiredProducts` entry
   * is present in the current cart. Iterates the product's own rules only;
   * the first matching `BUNDLE` rule wins.
   */
  private checkBundleDiscount(
    _productId: string,
    allProductIds: string[],
    rules: PricingRule[]
  ): number {
    for (const rule of rules) {
      if (rule.type !== 'BUNDLE') continue;
      const required = rule.requiredProducts ?? [];
      if (required.length === 0) continue;
      if (required.every((rId) => allProductIds.includes(rId))) {
        return rule.discountPercent ?? 0;
      }
    }
    return 0;
  }

  /**
   * Rule 5 — queries the `PromoCode` table for active, in-window codes in the
   * request, filters to those applicable to `productId`, and returns the
   * deepest discount percent across the matches. Returns 0 when nothing
   * applies.
   */
  private async getPromoDiscount(
    tenantId: string,
    promoCodes: string[],
    productId: string
  ): Promise<number> {
    if (promoCodes.length === 0) return 0;
    const now = new Date();
    const candidates = await this.prisma.promoCode.findMany({
      where: {
        tenantId,
        code: { in: promoCodes },
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
    });

    let best = 0;
    for (const promo of candidates) {
      // Redemption cap.
      if (promo.maxUses !== null && promo.uses >= promo.maxUses) continue;
      // Product allow-list (empty array = applies to every product).
      if (
        promo.applicableProductIds.length > 0 &&
        !promo.applicableProductIds.includes(productId)
      ) {
        continue;
      }
      if (promo.discountPercent > best) best = promo.discountPercent;
    }
    return best;
  }

  /**
   * Rule 7 — returns the floor price for `(product, tier)` when the product
   * carries a `FLOOR` rule. Falls back to the rule's `DEFAULT` entry when the
   * tier-specific floor is absent.
   */
  private getFloorPrice(
    product: ProductWithTiers,
    tier: string
  ): Decimal | null {
    const floorRule = product.pricingRules.find((r) => r.type === 'FLOOR');
    if (!floorRule || !floorRule.floors) return null;
    const floorValue = floorRule.floors[tier] ?? floorRule.floors.DEFAULT;
    return floorValue !== undefined ? new Decimal(floorValue) : null;
  }

  /**
   * Rule 10 — BOGO computation. For every priced line whose product carries a
   * `BOGO` rule, appends a zero-priced line of `floor(qty / 2)` units.
   */
  private computeFreeItems(
    _reqItems: CpqPricingRequest['items'],
    lineItems: CpqLineItem[],
    productMap: Map<string, ProductWithTiers>
  ): CpqLineItem[] {
    const freeItems: CpqLineItem[] = [];
    for (const item of lineItems) {
      const product = productMap.get(item.productId);
      if (!product) continue;
      const bogoRule = product.pricingRules.find((r) => r.type === 'BOGO');
      if (!bogoRule) continue;
      const freeQty = Math.floor(item.quantity / 2);
      if (freeQty <= 0) continue;
      freeItems.push({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        billingType: item.billingType,
        quantity: freeQty,
        listPrice: item.listPrice,
        unitPrice: 0,
        discountPercent: 100,
        discountAmount: item.listPrice,
        total: 0,
        taxPercent: 0,
        taxAmount: 0,
        notes: 'BOGO free item',
      });
    }
    return freeItems;
  }
}
