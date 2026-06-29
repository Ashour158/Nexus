import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { Decimal } from 'decimal.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function startAutoQuoteConsumer(
  prisma: FinancePrisma,
  log: LoggerLike
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('finance-service.auto-quote');

  consumer.on('deal.stage_changed', async (event) => {
    if (event.type !== 'deal.stage_changed') return;
    const payload = event.payload as Record<string, unknown>;
    const tenantId = event.tenantId;
    const dealId = String(payload.dealId ?? '');
    if (!dealId) return;

    const rules = await prisma.quoteAutomationRule.findMany({
      where: { tenantId, isActive: true, trigger: 'deal_stage_changed' },
      orderBy: { createdAt: 'asc' },
    });
    if (rules.length === 0) return;

    for (const rule of rules) {
      const conditions = (rule.conditions ?? {}) as Record<string, unknown>;
      const stageId = typeof payload.stageId === 'string' ? payload.stageId : null;
      const expectedStage = typeof conditions.stageId === 'string' ? conditions.stageId : null;
      if (expectedStage && expectedStage !== stageId) continue;

      const dealValue = getNumber(payload.amount) ?? 0;
      const min = getNumber(conditions.dealValueMin);
      const max = getNumber(conditions.dealValueMax);
      if (min !== null && dealValue < min) continue;
      if (max !== null && dealValue > max) continue;

      const quoteCount = await prisma.quote.count({ where: { tenantId } });
      const quoteName = `Auto Quote for ${dealId}`;
      const currency = String(payload.currency ?? 'USD');
      const accountId = String(payload.accountId ?? dealId);

      let lineItems: unknown[] = [];
      let pricingBreakdown: Record<string, unknown> = {};
      let subtotal = new Decimal(0);
      let total = new Decimal(0);
      let discountAmount = new Decimal(0);
      let taxAmount = new Decimal(0);
      let taxBreakdown: unknown[] = [];

      // Try to build real line items from the price book
      if (rule.priceBookId) {
        try {
          const entries = await prisma.priceBookEntry.findMany({
            where: { priceBookId: rule.priceBookId, tenantId },
            include: { product: true } as any,
            take: 50,
          });

          if (entries.length > 0) {
            const engine = new CpqPricingEngine(prisma);
            const cpqResult = await engine.calculate({
              tenantId,
              accountId,
              currency,
              items: entries.map((e) => ({
                productId: e.productId,
                quantity: 1,
              })),
            });

            lineItems = cpqResult.items;
            subtotal = new Decimal(cpqResult.subtotal);
            discountAmount = new Decimal(cpqResult.discountTotal);
            taxAmount = new Decimal(cpqResult.taxTotal);
            total = new Decimal(cpqResult.total);
            pricingBreakdown = {
              appliedRules: cpqResult.appliedRules,
              floorPriceWarnings: cpqResult.floorPriceWarnings,
              approvalRequired: cpqResult.approvalRequired,
              approvalReasons: cpqResult.approvalReasons,
            };
            taxBreakdown = [{ rate: 0.1, amount: cpqResult.taxTotal, name: 'Standard Tax' }];
          }
        } catch (engineErr) {
          log.warn({ engineErr, dealId, ruleId: rule.id }, 'CPQ engine failed for auto-quote; falling back to deal-value line item');
        }
      }

      // Fallback: create a single line item from the deal value if no products were priced
      if (lineItems.length === 0) {
        const dealValue = new Decimal(getNumber(payload.amount) ?? 0);
        lineItems = [
          {
            name: quoteName,
            quantity: 1,
            unitPrice: dealValue.toNumber(),
            listPrice: dealValue.toNumber(),
            discountPercent: 0,
            discountAmount: 0,
            total: dealValue.toNumber(),
            billingType: 'ONE_TIME',
          },
        ];
        subtotal = dealValue;
        total = dealValue;
        pricingBreakdown = { source: 'deal_value_fallback', dealValue: dealValue.toNumber() };
        taxBreakdown = [];
      }

      const quote = await prisma.quote.create({
        data: {
          tenantId,
          dealId,
          accountId,
          ownerId: String(payload.ownerId ?? 'system'),
          quoteNumber: `Q-${String(quoteCount + 1).padStart(6, '0')}`,
          name: quoteName,
          currency,
          subtotal,
          total,
          discountAmount,
          taxAmount,
          lineItems,
          pricingBreakdown,
          customFields: {},
          templateId: rule.templateId ?? null,
          priceBookId: rule.priceBookId ?? null,
          taxBreakdown,
        },
      });
      log.info({ dealId, quoteId: quote.id, ruleId: rule.id, lineItemCount: lineItems.length, total: total.toNumber() }, 'Auto quote created');
    }
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}

