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
/** Simplified uniform tax — production would call the tax engine per jurisdiction. */
const SIMPLE_TAX_RATE = 0.1;

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
  async calculate(req: CpqPricingRequest): Promise<CpqPricingResult> {
    // ── Load products + tiers in one query ─────────────────────────────────
    const productIds = req.items.map((i) => i.productId);
    const rawProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.tenantId, isActive: true },
      include: { priceTiers: true },
    });
    const productMap = new Map<string, ProductWithTiers>(
      rawProducts.map((p) => [p.id, toProductWithTiers(p)])
    );

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
      const listPrice = product.listPrice;
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
        discountPercent = discountPercent.plus(volDiscount);
        appliedRules.push(
          `Volume tier (qty ${qty}): -${volDiscount.toFixed(2)}%`
        );
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

      // Apply accumulated discount to obtain the post-rules-1..6 working price.
      let workingPrice = listPrice.times(
        new Decimal(1).minus(discountPercent.div(100))
      );

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
      if (reqItem.manualOverridePrice !== undefined) {
        const overridePrice = toDecimal(reqItem.manualOverridePrice);
        if (overridePrice.lt(workingPrice)) {
          workingPrice = overridePrice;
          discountPercent = listPrice
            .minus(workingPrice)
            .div(listPrice)
            .times(100);
          approvalRequired = true;
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

      const discountAmount = listPrice.minus(workingPrice);
      const total = workingPrice.times(qty);

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
    const taxTotal = lineItems
      .filter((i) => productMap.get(i.productId)?.taxable)
      .reduce(
        (sum, i) => sum.plus(new Decimal(i.total).times(SIMPLE_TAX_RATE)),
        new Decimal(0)
      );

    return {
      items: lineItems,
      subtotal: subtotal.toNumber(),
      discountTotal: discountTotal.toNumber(),
      taxTotal: taxTotal.toNumber(),
      total: subtotal.plus(taxTotal).toNumber(),
      appliedRules: [...new Set(appliedRules)],
      floorPriceWarnings: floorWarnings,
      approvalRequired,
      approvalReasons,
    };
  }

  // ─── Private rule helpers ─────────────────────────────────────────────────

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
        notes: 'BOGO free item',
      });
    }
    return freeItems;
  }
}
