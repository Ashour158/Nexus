import { toPaginatedResult } from '@nexus/shared-types';
import type { DealsPrisma } from '../prisma.js';

type ProjectionPrisma = DealsPrisma & {
  quoteProjection: {
    count(args: Record<string, unknown>): Promise<number>;
    findFirst(args: Record<string, unknown>): Promise<unknown | null>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    upsert(args: Record<string, unknown>): Promise<unknown>;
  };
  quoteProjectionEvent?: {
    findFirst(args: Record<string, unknown>): Promise<unknown | null>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    create(args: Record<string, unknown>): Promise<unknown>;
  };
};

type FinanceQuoteEvent = {
  id?: string;
  type: string;
  tenantId: string;
  timestamp?: string;
  correlationId?: string;
  version?: number;
  payload: Record<string, unknown>;
};

export type FinanceSourceEvent = {
  eventId: string;
  eventType: string;
  tenantId: string;
  aggregateType?: string | null;
  aggregateId?: string | null;
  occurredAt?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  transitionLedgerId?: string | null;
  source?: string | null;
  payload: Record<string, unknown>;
};

type Pagination = {
  page: number;
  limit: number;
};

export type QuoteProjectionHealth = {
  status: 'healthy' | 'stale' | 'degraded' | 'empty';
  projectionCount: number;
  latestProjectedAt: string | null;
  latestSourceEventTime: string | null;
  lastProcessedSourceEventId: string | null;
  lagMs: number | null;
  consumerFreshnessMs: number | null;
  staleAfterMinutes: number;
  consumerGroup: string;
  dlqTopic: string;
};

export type QuoteProjectionReplayReadiness = {
  dryRun: boolean;
  tenantId: string | null;
  quoteId: string | null;
  fromEventId: string | null;
  eventCount: number;
  latestEventId: string | null;
  safeToReplay: boolean;
  message: string;
};

export type GovernedProjectionReplayInput = {
  tenantId?: string | null;
  fromOccurredAt?: string | null;
  toOccurredAt?: string | null;
  fromEventId?: string | null;
  toEventId?: string | null;
  aggregateId?: string | null;
  aggregateType?: string | null;
  sourceEventTypes?: string[];
  limit?: number;
  dryRun?: boolean;
  execute?: boolean;
  reason: string;
  operatorId: string;
};

export type GovernedProjectionReplayReport = {
  operationId: string;
  projection: 'quoteProjection';
  dryRun: boolean;
  tenantId: string | null;
  operatorId: string;
  reason: string;
  filters: {
    fromOccurredAt: string | null;
    toOccurredAt: string | null;
    fromEventId: string | null;
    toEventId: string | null;
    aggregateId: string | null;
    aggregateType: string | null;
    sourceEventTypes: string[];
    limit: number;
  };
  counts: {
    candidates: number;
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    duplicate: number;
    failed: number;
  };
  executed: boolean;
  sourceEventAccess: {
    available: boolean;
    endpoint: string | null;
    candidateCount: number | null;
  };
  startedAt: string;
  completedAt: string;
  status: 'dry_run' | 'completed' | 'completed_with_warnings' | 'failed' | 'unsupported';
  sourceEventStorageAvailable: boolean;
  eventSourceAvailable: boolean;
  eventSourceEndpoint: string | null;
  candidateCount: number | null;
  warnings: string[];
  errors: string[];
};

type EventSourceProbeInput = {
  tenantId?: string | null;
  fromOccurredAt?: string | null;
  toOccurredAt?: string | null;
  fromEventId?: string | null;
  toEventId?: string | null;
  aggregateId?: string | null;
  aggregateType?: string | null;
  sourceEventTypes?: string[];
  limit?: number;
};

type EventSourceProbeResult = {
  available: boolean;
  endpoint: string | null;
  candidateCount: number | null;
  events?: FinanceSourceEvent[];
  error?: string;
};

type QuoteProjectionServiceOptions = {
  eventSource?: (input: EventSourceProbeInput) => Promise<EventSourceProbeResult>;
};

const PROJECTED_QUOTE_EVENTS = new Set([
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
]);

function metadataOf(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? payload.metadata as Record<string, unknown>
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
  return stringOf(metadata.sourceEventId)
    ?? stringOf(event.payload.sourceEventId)
    ?? stringOf(event.id)
    ?? stringOf(metadata.transitionLedgerId)
    ?? `${event.type}:${String(event.payload.quoteId ?? 'unknown')}:${String(event.payload.status ?? 'unknown')}`;
}

function canonicalPayloadFromSourceEvent(event: FinanceSourceEvent): Record<string, unknown> {
  const sourcePayload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const metadata = metadataOf(sourcePayload);
  return {
    ...sourcePayload,
    aggregateId: stringOf(sourcePayload.aggregateId) ?? event.aggregateId ?? undefined,
    occurredAt: stringOf(sourcePayload.occurredAt) ?? event.occurredAt ?? undefined,
    correlationId: stringOf(sourcePayload.correlationId) ?? event.correlationId ?? undefined,
    sourceEventId: stringOf(sourcePayload.sourceEventId) ?? event.eventId,
    metadata: {
      ...metadata,
      sourceEventId: event.eventId,
      transitionLedgerId: event.transitionLedgerId ?? stringOf(metadata.transitionLedgerId) ?? undefined,
      correlationId: event.correlationId ?? stringOf(metadata.correlationId) ?? undefined,
      idempotencyKey: event.idempotencyKey ?? stringOf(metadata.idempotencyKey) ?? undefined,
      source: event.source ?? stringOf(metadata.source) ?? undefined,
    },
  };
}

function quoteEventFromSourceEvent(event: FinanceSourceEvent): FinanceQuoteEvent {
  return {
    id: event.eventId,
    type: event.eventType,
    tenantId: event.tenantId,
    timestamp: event.occurredAt ?? undefined,
    correlationId: event.correlationId ?? undefined,
    payload: canonicalPayloadFromSourceEvent(event),
  };
}

function emptyReplayCounts(): GovernedProjectionReplayReport['counts'] {
  return {
    candidates: 0,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    duplicate: 0,
    failed: 0,
  };
}

async function existingProjectionForQuote(db: ProjectionPrisma, tenantId: string, quoteId: string): Promise<unknown | null> {
  return db.quoteProjection.findFirst({ where: { tenantId, quoteId } });
}

function canonicalProjectionMetadata(event: FinanceQuoteEvent, quoteId: string) {
  const metadata = metadataOf(event.payload);
  const sourceEventId = sourceEventIdOf(event);
  return {
    sourceEventId,
    sourceEventType: event.type,
    sourceAggregateId: stringOf(event.payload.aggregateId) ?? quoteId,
    sourceAggregateType: 'quote',
    sourceEventVersion: Number(metadata.eventVersion ?? event.payload.sourceEventVersion ?? event.version ?? 1),
    transitionLedgerId: stringOf(metadata.transitionLedgerId),
    projectedAt: new Date(),
    projectionVersion: 1,
    correlationId: stringOf(metadata.correlationId) ?? stringOf(event.payload.correlationId) ?? event.correlationId ?? null,
    tenantId: event.tenantId,
  };
}

export async function projectFinanceQuoteEvent(prisma: DealsPrisma, event: FinanceQuoteEvent) {
  if (!PROJECTED_QUOTE_EVENTS.has(event.type)) {
    return { status: 'ignored' as const };
  }
  const quoteId = stringOf(event.payload.quoteId);
  if (!quoteId) {
    return { status: 'ignored' as const, reason: 'missing_quote_id' };
  }

  const db = prisma as ProjectionPrisma;
  const sourceEventId = sourceEventIdOf(event);
  const duplicate = db.quoteProjectionEvent
    ? await db.quoteProjectionEvent.findFirst({ where: { tenantId: event.tenantId, sourceEventId } })
    : await db.quoteProjection.findFirst({
    where: { tenantId: event.tenantId, sourceEventId },
  });
  if (duplicate) {
    return { status: 'duplicate' as const, projection: duplicate };
  }

  const projectionMetadata = canonicalProjectionMetadata(event, quoteId);
  const data = {
    tenantId: event.tenantId,
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
    sourceEventVersion: projectionMetadata.sourceEventVersion,
    sourceAggregateId: projectionMetadata.sourceAggregateId,
    sourceAggregateType: projectionMetadata.sourceAggregateType,
    correlationId: projectionMetadata.correlationId,
    transitionLedgerId: projectionMetadata.transitionLedgerId,
    projectionVersion: projectionMetadata.projectionVersion,
    projectedAt: projectionMetadata.projectedAt,
  };

  const projection = await db.quoteProjection.upsert({
    where: { tenantId_quoteId: { tenantId: event.tenantId, quoteId } },
    create: data,
    update: data,
  });

  await db.quoteProjectionEvent?.create({
    data: {
      tenantId: event.tenantId,
      quoteId,
      sourceEventId,
      sourceEventVersion: data.sourceEventVersion,
      financeEventType: event.type,
      sourceAggregateId: data.sourceAggregateId,
      sourceAggregateType: data.sourceAggregateType,
      correlationId: data.correlationId,
      transitionLedgerId: data.transitionLedgerId,
      projectionVersion: data.projectionVersion,
    },
  });

  return { status: 'projected' as const, projection };
}

export function createQuoteProjectionsService(prisma: DealsPrisma, options: QuoteProjectionServiceOptions = {}) {
  const db = prisma as ProjectionPrisma;

  async function list(where: Record<string, unknown>, pagination: Pagination) {
    const page = pagination.page;
    const limit = pagination.limit;
    const [total, rows] = await Promise.all([
      db.quoteProjection.count({ where }),
      db.quoteProjection.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { projectedAt: 'desc' },
      }),
    ]);
    return toPaginatedResult(rows, total, page, limit);
  }

  return {
    listByDeal(tenantId: string, dealId: string, pagination: Pagination) {
      return list({ tenantId, dealId }, pagination);
    },
    listByAccount(tenantId: string, accountId: string, pagination: Pagination) {
      return list({ tenantId, accountId }, pagination);
    },
    listByContact(tenantId: string, contactId: string, pagination: Pagination) {
      return list({ tenantId, contactId }, pagination);
    },
    async health(tenantId: string | null, staleAfterMinutes = 15): Promise<QuoteProjectionHealth> {
      const where = tenantId ? { tenantId } : {};
      const [projectionCount, latest] = await Promise.all([
        db.quoteProjection.count({ where }),
        db.quoteProjection.findFirst({
          where,
          orderBy: { projectedAt: 'desc' },
        }),
      ]);

      if (!latest || typeof latest !== 'object') {
        return {
          status: 'empty',
          projectionCount,
          latestProjectedAt: null,
          latestSourceEventTime: null,
          lastProcessedSourceEventId: null,
          lagMs: null,
          consumerFreshnessMs: null,
          staleAfterMinutes,
          consumerGroup: 'deals-service.quote-projections',
          dlqTopic: 'nexus.finance.quotes.dlq',
        };
      }

      const row = latest as Record<string, unknown>;
      const projectedAt = dateOf(row.projectedAt);
      const latestProjectedAt = projectedAt?.toISOString() ?? null;
      const ageMs = projectedAt ? Date.now() - projectedAt.getTime() : Number.POSITIVE_INFINITY;
      const warningMs = staleAfterMinutes * 60_000;
      const degradedMs = warningMs * 2;
      return {
        status: ageMs > degradedMs ? 'degraded' : ageMs > warningMs ? 'stale' : 'healthy',
        projectionCount,
        latestProjectedAt,
        latestSourceEventTime: null,
        lastProcessedSourceEventId: stringOf(row.sourceEventId),
        lagMs: Number.isFinite(ageMs) ? ageMs : null,
        consumerFreshnessMs: Number.isFinite(ageMs) ? ageMs : null,
        staleAfterMinutes,
        consumerGroup: 'deals-service.quote-projections',
        dlqTopic: 'nexus.finance.quotes.dlq',
      };
    },
    async rebuildReadiness(input: {
      tenantId?: string | null;
      quoteId?: string | null;
      fromEventId?: string | null;
      dryRun?: boolean;
    }): Promise<QuoteProjectionReplayReadiness> {
      const where: Record<string, unknown> = {};
      if (input.tenantId) where.tenantId = input.tenantId;
      if (input.quoteId) where.quoteId = input.quoteId;
      if (input.fromEventId) where.sourceEventId = { gte: input.fromEventId };
      const [eventCount, latestEvent] = await Promise.all([
        db.quoteProjectionEvent ? db.quoteProjectionEvent.findMany({ where, take: 1000 }) : Promise.resolve([]),
        db.quoteProjectionEvent
          ? db.quoteProjectionEvent.findFirst({ where, orderBy: { projectedAt: 'desc' } })
          : Promise.resolve(null),
      ]);
      return {
        dryRun: input.dryRun !== false,
        tenantId: input.tenantId ?? null,
        quoteId: input.quoteId ?? null,
        fromEventId: input.fromEventId ?? null,
        eventCount: eventCount.length,
        latestEventId: latestEvent && typeof latestEvent === 'object' ? stringOf((latestEvent as Record<string, unknown>).sourceEventId) : null,
        safeToReplay: false,
        message: 'Projection rebuild is dry-run only in this slice; use QuoteProjectionEvent as the replay source after an approved replay design.',
      };
    },
    async governedReplay(input: GovernedProjectionReplayInput): Promise<GovernedProjectionReplayReport> {
      const startedAt = new Date();
      const dryRun = input.dryRun !== false;
      const execute = input.execute === true && !dryRun;
      const limit = Math.min(Math.max(Number(input.limit ?? 100), 1), 500);
      const eventSource = options.eventSource
        ? await options.eventSource({
          tenantId: input.tenantId,
          fromOccurredAt: input.fromOccurredAt,
          toOccurredAt: input.toOccurredAt,
          fromEventId: input.fromEventId,
          toEventId: input.toEventId,
          aggregateId: input.aggregateId,
          aggregateType: input.aggregateType,
          sourceEventTypes: input.sourceEventTypes,
          limit,
        }).catch((error: unknown) => ({
          available: false,
          endpoint: null,
          candidateCount: null,
          events: [],
          error: error instanceof Error ? error.message : String(error),
        }))
        : { available: false, endpoint: null, candidateCount: null, events: [] };
      const warnings: string[] = [];
      const errors: string[] = [];
      const counts = emptyReplayCounts();
      const sourceEvents = eventSource.events ?? [];
      counts.candidates = sourceEvents.length;

      if (!eventSource.available) {
        warnings.push(
          'Replay execution is unavailable because canonical finance source-event access is not configured or unavailable.',
          ...(eventSource.error ? [`Finance event-source probe failed: ${eventSource.error}`] : [])
        );
      } else {
        for (const sourceEvent of sourceEvents) {
          if (!PROJECTED_QUOTE_EVENTS.has(sourceEvent.eventType)) {
            counts.skipped += 1;
            warnings.push(`Skipped unsupported finance event type ${sourceEvent.eventType}`);
            continue;
          }

          const replayEvent = quoteEventFromSourceEvent(sourceEvent);
          const quoteId = stringOf(replayEvent.payload.quoteId);
          if (!quoteId) {
            counts.skipped += 1;
            warnings.push(`Skipped ${sourceEvent.eventId} because quoteId is missing`);
            continue;
          }

          const duplicate = db.quoteProjectionEvent
            ? await db.quoteProjectionEvent.findFirst({ where: { tenantId: replayEvent.tenantId, sourceEventId: sourceEventIdOf(replayEvent) } })
            : await db.quoteProjection.findFirst({ where: { tenantId: replayEvent.tenantId, sourceEventId: sourceEventIdOf(replayEvent) } });
          if (duplicate) {
            counts.duplicate += 1;
            continue;
          }

          const existingProjection = await existingProjectionForQuote(db, replayEvent.tenantId, quoteId);
          if (execute) {
            try {
              const result = await projectFinanceQuoteEvent(prisma, replayEvent);
              if (result.status === 'projected') {
                counts.processed += 1;
                if (existingProjection) counts.updated += 1;
                else counts.created += 1;
              } else if (result.status === 'duplicate') {
                counts.duplicate += 1;
              } else {
                counts.skipped += 1;
                warnings.push(`Skipped ${sourceEvent.eventId}: ${result.reason ?? 'ignored'}`);
              }
            } catch (error) {
              counts.failed += 1;
              errors.push(error instanceof Error ? error.message : String(error));
            }
          } else if (existingProjection) {
            counts.updated += 1;
          } else {
            counts.created += 1;
          }
        }
      }

      const completedAt = new Date();
      const status: GovernedProjectionReplayReport['status'] = !eventSource.available
        ? 'unsupported'
        : dryRun
          ? 'dry_run'
          : errors.length > 0
            ? 'failed'
            : warnings.length > 0
              ? 'completed_with_warnings'
              : 'completed';
      return {
        operationId: `quoteProjection-replay:${startedAt.getTime()}`,
        projection: 'quoteProjection',
        dryRun,
        executed: execute,
        tenantId: input.tenantId ?? null,
        operatorId: input.operatorId,
        reason: input.reason,
        filters: {
          fromOccurredAt: input.fromOccurredAt ?? null,
          toOccurredAt: input.toOccurredAt ?? null,
          fromEventId: input.fromEventId ?? null,
          toEventId: input.toEventId ?? null,
          aggregateId: input.aggregateId ?? null,
          aggregateType: input.aggregateType ?? null,
          sourceEventTypes: input.sourceEventTypes ?? [],
          limit,
        },
        counts,
        sourceEventAccess: {
          available: eventSource.available,
          endpoint: eventSource.endpoint,
          candidateCount: eventSource.candidateCount,
        },
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        status,
        sourceEventStorageAvailable: eventSource.available,
        eventSourceAvailable: eventSource.available,
        eventSourceEndpoint: eventSource.endpoint,
        candidateCount: eventSource.candidateCount,
        warnings,
        errors,
      };
    },
  };
}
