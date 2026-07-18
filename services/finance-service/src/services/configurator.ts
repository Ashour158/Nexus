import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { computeQuoteTotals } from './quotes.service.js';

// ─── Pure resolver types (DB-agnostic, deterministic) ─────────────────────────

export type ConfigRuleKind = 'REQUIRES' | 'EXCLUDES' | 'AUTO_ADD' | 'PRICE_ADJUST';

export interface OptionGroupLike {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  sortOrder: number;
}

export interface ProductOptionLike {
  id: string;
  optionGroupId: string;
  name: string;
  sku?: string | null;
  priceDelta: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface ConfigRuleLike {
  id: string;
  name: string;
  type: ConfigRuleKind;
  whenOptionId: string;
  thenOptionId?: string | null;
  adjustment?: number | null;
  isActive: boolean;
}

export interface ConfigViolation {
  rule: string;
  message: string;
}

export interface ConfigResolution {
  valid: boolean;
  violations: ConfigViolation[];
  /** Option ids auto-added by AUTO_ADD rules (not originally selected). */
  autoAdded: string[];
  /** Selected ∪ auto-added, deduped, restricted to known options. */
  effectiveOptionIds: string[];
  /** Net price delta = Σ option priceDelta + Σ PRICE_ADJUST adjustments. */
  totalPriceDelta: number;
  /** Per-rule PRICE_ADJUST contributions (for transparency / materialization). */
  priceAdjustments: { rule: string; amount: number }[];
}

// ─── Pure resolver ────────────────────────────────────────────────────────────

/**
 * Deterministic configuration resolver. Given the option groups, options, rules
 * and the buyer's raw selection, it:
 *   1. expands AUTO_ADD rules to a fixed point,
 *   2. enforces per-group min/max/required cardinality,
 *   3. enforces REQUIRES / EXCLUDES constraints,
 *   4. applies PRICE_ADJUST rules and sums the net price delta.
 *
 * Output ordering is stable (options by sortOrder→id, rules by id) so results
 * are reproducible and easy to test without a database.
 */
export function resolveConfiguration(input: {
  groups: OptionGroupLike[];
  options: ProductOptionLike[];
  rules: ConfigRuleLike[];
  selectedOptionIds: string[];
}): ConfigResolution {
  const violations: ConfigViolation[] = [];

  const optionById = new Map(input.options.map((o) => [o.id, o]));
  const groupSortById = new Map(input.groups.map((g) => [g.id, g.sortOrder]));
  const activeRules = input.rules
    .filter((r) => r.isActive)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Restrict the raw selection to known, deduped options. Unknown ids are a
  // hard violation (the client is out of sync with the catalog).
  const selected = new Set<string>();
  for (const id of input.selectedOptionIds) {
    if (optionById.has(id)) {
      selected.add(id);
    } else {
      violations.push({
        rule: 'UNKNOWN_OPTION',
        message: `Option ${id} does not belong to this configurable product.`,
      });
    }
  }

  // Expand AUTO_ADD rules to a fixed point (transitive auto-adds supported).
  const effective = new Set(selected);
  const autoAdded = new Set<string>();
  const autoAddRules = activeRules.filter((r) => r.type === 'AUTO_ADD');
  let changed = true;
  let guard = 0;
  const guardLimit = autoAddRules.length + 1;
  while (changed && guard <= guardLimit) {
    changed = false;
    guard += 1;
    for (const rule of autoAddRules) {
      if (!effective.has(rule.whenOptionId)) continue;
      const target = rule.thenOptionId;
      if (!target || !optionById.has(target)) continue;
      if (!effective.has(target)) {
        effective.add(target);
        if (!selected.has(target)) autoAdded.add(target);
        changed = true;
      }
    }
  }

  const effectiveOptionIds = [...effective]
    .filter((id) => optionById.has(id))
    .sort((a, b) => {
      const oa = optionById.get(a)!;
      const ob = optionById.get(b)!;
      // Group order first (so lines materialize group-by-group), then the
      // option's own sortOrder, then id as a stable tiebreak.
      const ga = groupSortById.get(oa.optionGroupId) ?? 0;
      const gb = groupSortById.get(ob.optionGroupId) ?? 0;
      if (ga !== gb) return ga - gb;
      if (oa.sortOrder !== ob.sortOrder) return oa.sortOrder - ob.sortOrder;
      return oa.id < ob.id ? -1 : oa.id > ob.id ? 1 : 0;
    });

  // Per-group cardinality (min / max / required).
  const countByGroup = new Map<string, number>();
  for (const id of effectiveOptionIds) {
    const groupId = optionById.get(id)!.optionGroupId;
    countByGroup.set(groupId, (countByGroup.get(groupId) ?? 0) + 1);
  }
  const groupsSorted = input.groups
    .slice()
    .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id < b.id ? -1 : 1));
  for (const group of groupsSorted) {
    const count = countByGroup.get(group.id) ?? 0;
    if (group.required && count < 1) {
      violations.push({
        rule: 'GROUP_REQUIRED',
        message: `Group "${group.name}" requires at least one option.`,
      });
    }
    if (group.minSelect > 0 && count < group.minSelect) {
      violations.push({
        rule: 'GROUP_MIN',
        message: `Group "${group.name}" requires at least ${group.minSelect} option(s); ${count} selected.`,
      });
    }
    if (group.maxSelect > 0 && count > group.maxSelect) {
      violations.push({
        rule: 'GROUP_MAX',
        message: `Group "${group.name}" allows at most ${group.maxSelect} option(s); ${count} selected.`,
      });
    }
  }

  const nameOf = (id: string) => optionById.get(id)?.name ?? id;

  // REQUIRES / EXCLUDES constraints (evaluated against the effective set).
  for (const rule of activeRules) {
    if (rule.type === 'REQUIRES') {
      if (rule.thenOptionId && effective.has(rule.whenOptionId) && !effective.has(rule.thenOptionId)) {
        violations.push({
          rule: rule.name,
          message: `"${nameOf(rule.whenOptionId)}" requires "${nameOf(rule.thenOptionId)}".`,
        });
      }
    } else if (rule.type === 'EXCLUDES') {
      if (rule.thenOptionId && effective.has(rule.whenOptionId) && effective.has(rule.thenOptionId)) {
        violations.push({
          rule: rule.name,
          message: `"${nameOf(rule.whenOptionId)}" cannot be combined with "${nameOf(rule.thenOptionId)}".`,
        });
      }
    }
  }

  // PRICE_ADJUST rules + option deltas → net price delta.
  const priceAdjustments: { rule: string; amount: number }[] = [];
  let totalPriceDelta = 0;
  for (const id of effectiveOptionIds) {
    totalPriceDelta += Number(optionById.get(id)!.priceDelta) || 0;
  }
  for (const rule of activeRules) {
    if (rule.type !== 'PRICE_ADJUST') continue;
    if (!effective.has(rule.whenOptionId)) continue;
    const amount = Number(rule.adjustment) || 0;
    if (amount === 0) continue;
    priceAdjustments.push({ rule: rule.name, amount });
    totalPriceDelta += amount;
  }

  totalPriceDelta = Number(totalPriceDelta.toFixed(2));

  return {
    valid: violations.length === 0,
    violations,
    autoAdded: [...autoAdded].sort(),
    effectiveOptionIds,
    totalPriceDelta,
    priceAdjustments,
  };
}

// ─── DB-backed loader / validator ─────────────────────────────────────────────

async function loadConfigurableProduct(prisma: FinancePrisma, tenantId: string, id: string) {
  const product = await prisma.configurableProduct.findFirst({ where: { id, tenantId } });
  if (!product) throw new NotFoundError('ConfigurableProduct', id);
  return product;
}

async function loadConfigGraph(prisma: FinancePrisma, tenantId: string, configurableProductId: string) {
  const groups = await prisma.optionGroup.findMany({
    where: { tenantId, configurableProductId },
    orderBy: { sortOrder: 'asc' },
  });
  const groupIds = groups.map((g) => g.id);
  const options = groupIds.length
    ? await prisma.productOption.findMany({
        where: { tenantId, optionGroupId: { in: groupIds } },
        orderBy: { sortOrder: 'asc' },
      })
    : [];
  const rules = await prisma.configRule.findMany({
    where: { tenantId, configurableProductId, isActive: true },
  });

  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      required: g.required,
      sortOrder: g.sortOrder,
    })) satisfies OptionGroupLike[],
    options: options.map((o) => ({
      id: o.id,
      optionGroupId: o.optionGroupId,
      name: o.name,
      sku: o.sku,
      priceDelta: Number(o.priceDelta),
      isDefault: o.isDefault,
      sortOrder: o.sortOrder,
    })) satisfies ProductOptionLike[],
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as ConfigRuleKind,
      whenOptionId: r.whenOptionId,
      thenOptionId: r.thenOptionId,
      adjustment: r.adjustment === null ? null : Number(r.adjustment),
      isActive: r.isActive,
    })) satisfies ConfigRuleLike[],
    optionRows: options,
  };
}

export function createConfiguratorService(prisma: FinancePrisma) {
  return {
    resolveConfiguration,

    /**
     * Validates a selection against a configurable product's groups + rules and
     * returns the resolver output. Throws NotFound if the product is unknown.
     */
    async validateConfiguration(
      tenantId: string,
      configurableProductId: string,
      selectedOptionIds: string[]
    ): Promise<ConfigResolution> {
      await loadConfigurableProduct(prisma, tenantId, configurableProductId);
      const graph = await loadConfigGraph(prisma, tenantId, configurableProductId);
      return resolveConfiguration({
        groups: graph.groups,
        options: graph.options,
        rules: graph.rules,
        selectedOptionIds,
      });
    },

    /**
     * Validates then materializes the base product + selected/auto-added options
     * (and any PRICE_ADJUST) as REAL quote line items, appended to the quote's
     * existing lines and re-priced through the canonical `computeQuoteTotals`
     * helper. On an invalid configuration it returns `{ applied: false }` with the
     * violations so the route can answer 422 without mutating the quote.
     */
    async applyToQuote(
      tenantId: string,
      input: { quoteId: string; configurableProductId: string; selectedOptionIds: string[]; actorId?: string }
    ): Promise<
      | { applied: false; validation: ConfigResolution }
      | {
          applied: true;
          validation: ConfigResolution;
          quote: Awaited<ReturnType<FinancePrisma['quote']['update']>>;
          addedLineItems: Array<Record<string, unknown>>;
        }
    > {
      const quote = await prisma.quote.findFirst({ where: { id: input.quoteId, tenantId } });
      if (!quote) throw new NotFoundError('Quote', input.quoteId);
      if (quote.status !== 'DRAFT') {
        throw new BusinessRuleError(
          `Configuration can only be applied to a DRAFT quote (current status: ${quote.status})`
        );
      }

      const configurable = await loadConfigurableProduct(prisma, tenantId, input.configurableProductId);
      const graph = await loadConfigGraph(prisma, tenantId, input.configurableProductId);
      const validation = resolveConfiguration({
        groups: graph.groups,
        options: graph.options,
        rules: graph.rules,
        selectedOptionIds: input.selectedOptionIds,
      });

      if (!validation.valid) {
        return { applied: false, validation };
      }

      const baseProduct = await prisma.product.findFirst({
        where: { id: configurable.productId, tenantId },
      });
      if (!baseProduct) {
        throw new BusinessRuleError(
          `Configurable product "${configurable.name}" references a missing base product`
        );
      }

      const optionRowById = new Map(graph.optionRows.map((o) => [o.id, o]));
      const billingType = String(baseProduct.billingType);
      const baseList = Number(baseProduct.listPrice) || 0;

      const line = (over: Record<string, unknown>) => ({
        productId: baseProduct.id,
        productName: baseProduct.name,
        sku: baseProduct.sku,
        quantity: 1,
        listPrice: 0,
        unitPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        total: 0,
        taxPercent: 0,
        taxAmount: 0,
        billingType,
        source: 'CONFIGURATOR',
        configurableProductId: configurable.id,
        ...over,
      });

      const addedLineItems: Array<Record<string, unknown>> = [];

      // Base product line.
      addedLineItems.push(
        line({
          listPrice: baseList,
          unitPrice: baseList,
          total: baseList,
          notes: `Configured: ${configurable.name}`,
        })
      );

      // One line per effective (selected + auto-added) option.
      for (const optionId of validation.effectiveOptionIds) {
        const opt = optionRowById.get(optionId);
        if (!opt) continue;
        const delta = Number(opt.priceDelta) || 0;
        addedLineItems.push(
          line({
            productName: `${baseProduct.name} — ${opt.name}`,
            sku: opt.sku ?? baseProduct.sku,
            listPrice: delta,
            unitPrice: delta,
            total: delta,
            optionId: opt.id,
            notes: `Option: ${opt.name}`,
          })
        );
      }

      // Fold PRICE_ADJUST rules into a single adjustment line (if non-zero).
      const adjustTotal = validation.priceAdjustments.reduce((s, a) => s + a.amount, 0);
      if (adjustTotal !== 0) {
        addedLineItems.push(
          line({
            productName: `${configurable.name} — configuration adjustment`,
            listPrice: adjustTotal,
            unitPrice: adjustTotal,
            total: adjustTotal,
            notes: 'Rule-based configuration price adjustment',
          })
        );
      }

      const existingLines = Array.isArray(quote.lineItems)
        ? (quote.lineItems as unknown as Array<Record<string, unknown>>)
        : [];
      const nextLineItems = [...existingLines, ...addedLineItems];
      const totals = computeQuoteTotals(nextLineItems);

      const nextVersion = Number(quote.version ?? 1) + 1;

      const updated = await prisma.$transaction(async (tx) => {
        const db = tx as unknown as {
          quote: { update: Function };
          quoteLine: { deleteMany: Function; createMany: Function };
          quoteRevision: { createMany: Function };
        };
        const q = await db.quote.update({
          where: { id: quote.id },
          data: {
            lineItems: nextLineItems as unknown as Prisma.InputJsonValue,
            subtotal: new Prisma.Decimal(totals.subtotal),
            discountAmount: new Prisma.Decimal(totals.discountAmount),
            taxAmount: new Prisma.Decimal(totals.taxAmount),
            total: new Prisma.Decimal(totals.total),
            version: nextVersion,
          },
        });

        // Rebuild the relational QuoteLine mirror from the full line set.
        await db.quoteLine.deleteMany({ where: { tenantId, quoteId: quote.id } });
        await db.quoteLine.createMany({
          data: nextLineItems.map((item, index) => ({
            tenantId,
            quoteId: quote.id,
            productId: String(item.productId ?? ''),
            productName: String(item.productName ?? item.productId ?? 'Line item'),
            description: String(item.notes ?? item.productName ?? 'Line item'),
            quantity: new Prisma.Decimal(Number(item.quantity ?? 1) || 1),
            listPrice: new Prisma.Decimal(Number(item.listPrice ?? item.unitPrice ?? 0) || 0),
            unitPrice: new Prisma.Decimal(Number(item.unitPrice ?? 0) || 0),
            discountPercent: new Prisma.Decimal(Number(item.discountPercent ?? 0) || 0),
            discountAmount: new Prisma.Decimal(Number(item.discountAmount ?? 0) || 0),
            taxPercent: new Prisma.Decimal(Number(item.taxPercent ?? 0) || 0),
            taxAmount: new Prisma.Decimal(Number(item.taxAmount ?? 0) || 0),
            lineTotal: new Prisma.Decimal(
              Number(item.total ?? (Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1))) || 0
            ),
            sortOrder: index,
            source: String(item.source ?? 'CPQ'),
            customFields: {} as Prisma.InputJsonValue,
          })),
        });

        await db.quoteRevision.createMany({
          data: [
            {
              tenantId,
              quoteId: quote.id,
              version: nextVersion,
              reason: 'quote.configuration.applied',
              status: q.status,
              snapshot: {
                configurableProductId: configurable.id,
                effectiveOptionIds: validation.effectiveOptionIds,
                totalPriceDelta: validation.totalPriceDelta,
                totals,
              } as Prisma.InputJsonValue,
              createdById: input.actorId ?? null,
            },
          ],
          skipDuplicates: true,
        });

        return q;
      });

      return { applied: true, validation, quote: updated, addedLineItems };
    },
  };
}

export type ConfiguratorService = ReturnType<typeof createConfiguratorService>;
