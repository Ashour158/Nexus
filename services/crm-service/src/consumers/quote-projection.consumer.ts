import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';

/**
 * Quote-projection read-model consumer (migrated from deals-service).
 *
 * Subscribes to TOPICS.QUOTES and maintains a per-deal/account/contact
 * read-model of finance quote lifecycle state in the `QuoteProjection`
 * table. Powers the deal-detail Quotes tab.
 *
 * Uses a DISTINCT consumer group (`crm-service.quote-projections`) so it can
 * run alongside the legacy deals-service consumer during the transition.
 *
 * Idempotency: dedupe on (tenantId, sourceEventId) via QuoteProjectionEvent,
 * and upsert QuoteProjection by (tenantId, quoteId). Fail-open — a single bad
 * event never crashes the consumer.
 */

const FINANCE_QUOTE_EVENTS = [
  'quote.created',
  'quote.created_from_rfq',
  'quote.submitted_for_approval',
  'quote.approved',
  'quote.rejected',
  'quote.sent',
  'quote.signature_requested',
  'quote.signed',
  'quote.accepted',
  'quote.expired',
  'quote.voided',
  'quote.converted_to_order',
  'quote.revision_created',
] as const;

const PROJECTED_QUOTE_EVENTS = new Set<string>(FINANCE_QUOTE_EVENTS);

type ProjectionPrisma = Pick<CrmPrisma, 'quoteProjection' | 'quoteProjectionEvent'>;

type FinanceQuoteEvent = {
  id?: string;
  type: string;
  tenantId: string;
  timestamp?: string;
  correlationId?: string;
  version?: number;
  payload: Record<string, unknown>;
};

export type ProjectFinanceQuoteResult =
  | { status: 'projected'; projection: unknown }
  | { status: 'duplicate'; projection: unknown }
  | { status: 'ignored'; reason?: string };

function metadataOf(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? (payload.metadata as Record<string, unknown>)
    : {};
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOf(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateOf(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sourceEventIdOf(event: FinanceQuoteEvent): string {
  const metadata = metadataOf(event.payload);
  return (
    stringOf(metadata.sourceEventId) ??
    stringOf(event.payload.sourceEventId) ??
    stringOf(event.id) ??
    stringOf(metadata.transitionLedgerId) ??
    `${event.type}:${String(event.payload.quoteId ?? 'unknown')}:${String(event.payload.status ?? 'unknown')}`
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Projects a single finance quote event into the QuoteProjection read-model.
 * Idempotent: replaying the same events yields the same per-deal quotes list.
 */
export async function projectFinanceQuoteEvent(
  prisma: ProjectionPrisma,
  event: FinanceQuoteEvent
): Promise<ProjectFinanceQuoteResult> {
  if (!PROJECTED_QUOTE_EVENTS.has(event.type)) {
    return { status: 'ignored' };
  }
  const quoteId = stringOf(event.payload.quoteId);
  if (!quoteId) {
    return { status: 'ignored', reason: 'missing_quote_id' };
  }
  const tenantId = event.tenantId ?? stringOf(event.payload.tenantId);
  if (!tenantId) {
    return { status: 'ignored', reason: 'missing_tenant' };
  }

  const sourceEventId = sourceEventIdOf(event);
  const duplicate = await prisma.quoteProjectionEvent.findFirst({
    where: { tenantId, sourceEventId },
  } as never);
  if (duplicate) {
    return { status: 'duplicate', projection: duplicate };
  }

  const metadata = metadataOf(event.payload);
  const sourceAggregateId = stringOf(event.payload.aggregateId) ?? quoteId;
  const sourceEventVersion = Number(metadata.eventVersion ?? event.payload.sourceEventVersion ?? event.version ?? 1);
  const correlationId =
    stringOf(metadata.correlationId) ?? stringOf(event.payload.correlationId) ?? event.correlationId ?? null;
  const transitionLedgerId = stringOf(metadata.transitionLedgerId);

  const data = {
    tenantId,
    quoteId,
    accountId: stringOf(event.payload.accountId),
    contactId: stringOf(event.payload.contactId),
    dealId: stringOf(event.payload.dealId),
    rfqId: stringOf(event.payload.rfqId),
    quoteNumber: stringOf(event.payload.quoteNumber),
    status: stringOf(event.payload.status) ?? event.type.replace('quote.', '').toUpperCase(),
    totalAmount: numberOf(event.payload.total ?? event.payload.totalAmount),
    currency: stringOf(event.payload.currency) ?? 'USD',
    currentRevisionId: stringOf(event.payload.currentRevisionId ?? event.payload.revisionId),
    validUntil: dateOf(event.payload.validUntil ?? event.payload.expiresAt),
    lastFinanceEventType: event.type,
    sourceEventId,
    sourceEventVersion,
    sourceAggregateId,
    sourceAggregateType: 'quote',
    correlationId,
    transitionLedgerId,
    projectionVersion: 1,
    projectedAt: new Date(),
  };

  try {
    const projection = await prisma.quoteProjection.upsert({
      where: { tenantId_quoteId: { tenantId, quoteId } },
      create: data,
      update: data,
    } as never);

    await prisma.quoteProjectionEvent.create({
      data: {
        tenantId,
        quoteId,
        sourceEventId,
        sourceEventVersion,
        financeEventType: event.type,
        sourceAggregateId,
        sourceAggregateType: 'quote',
        correlationId,
        transitionLedgerId,
        projectionVersion: 1,
      },
    } as never);

    return { status: 'projected', projection };
  } catch (error) {
    // A concurrent duplicate (same sourceEventId) races into the unique index.
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.quoteProjection.findFirst({ where: { tenantId, quoteId } } as never);
      return { status: 'duplicate', projection: existing };
    }
    throw error;
  }
}

export async function startQuoteProjectionConsumer(prisma: CrmPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('crm-service.quote-projections');
  await consumer.subscribe([TOPICS.QUOTES]);

  for (const type of FINANCE_QUOTE_EVENTS) {
    consumer.on(type, async (event) => {
      await projectFinanceQuoteEvent(prisma, {
        id:
          typeof event.payload === 'object' && event.payload
            ? stringOf((event.payload as Record<string, unknown>).eventId) ?? undefined
            : undefined,
        type: event.type,
        tenantId: event.tenantId,
        payload: (event.payload ?? {}) as Record<string, unknown>,
      });
    });
  }

  await consumer.start();
  return consumer;
}
