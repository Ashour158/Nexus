import { createHash } from 'crypto';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';

const FINANCE_TIMELINE_EVENTS = [
  'rfq.created',
  'rfq.submitted_for_review',
  'rfq.review_started',
  'rfq.reviewed',
  'rfq.returned',
  'rfq.ready_for_quote',
  'rfq.responded',
  'rfq.cancelled',
  'rfq.converted_to_quote',
  'quote.created_from_rfq',
  'quote.revision_created',
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
  'drq.requested',
  'drq.approved',
  'drq.rejected',
  'quote.discount_request.created',
  'order.created',
  'order.created_from_quote',
] as const;

type FinanceTimelineEventType = (typeof FINANCE_TIMELINE_EVENTS)[number];

type FinanceTimelineEvent = {
  id?: string;
  type?: string;
  tenantId?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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

type ProjectionResult =
  | { status: 'projected'; activityId: string; sourceEventId: string }
  | { status: 'duplicate'; sourceEventId: string }
  | { status: 'ignored'; reason: string };

export type FinanceTimelineHealth = {
  status: 'healthy' | 'stale' | 'degraded' | 'empty';
  projectedEventCount: number;
  latestProjectedAt: string | null;
  latestSourceEventTime: string | null;
  latestSourceEventId: string | null;
  lagMs: number | null;
  consumerFreshnessMs: number | null;
  staleAfterMinutes: number;
  consumerGroup: string;
  dlqTopic: string;
};

export type FinanceTimelineReplayInput = {
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
  eventSource?: (input: {
    tenantId?: string | null;
    fromOccurredAt?: string | null;
    toOccurredAt?: string | null;
    fromEventId?: string | null;
    toEventId?: string | null;
    aggregateId?: string | null;
    aggregateType?: string | null;
    sourceEventTypes?: string[];
    limit?: number;
  }) => Promise<{ available: boolean; endpoint: string | null; candidateCount: number | null; events?: FinanceSourceEvent[]; error?: string }>;
};

export type FinanceTimelineReplayReport = {
  operationId: string;
  projection: 'financeTimeline';
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

export type FinanceTimelineIdempotencyReadinessInput = {
  tenantId?: string | null;
  fromCreatedAt?: string | null;
  toCreatedAt?: string | null;
  sourceEventTypes?: string[];
  category?: FinanceTimelineReadinessCategory;
  cursor?: string | null;
  limit?: number;
  includeSamples?: boolean;
};

type FinanceTimelineActivityRow = {
  id: string;
  tenantId: string;
  accountId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  createdAt?: Date | string | null;
  customFields?: Record<string, unknown> | null;
};

type FinanceTimelineReadinessSample = {
  activityId: string;
  tenantId: string;
  sourceEventId: string | null;
  sourceEventType: string | null;
  aggregateId: string | null;
  aggregateType: string | null;
  accountId: string | null;
  contactId: string | null;
  dealId: string | null;
  createdAt: string | null;
  projectionIdempotencyVersion: number | null;
};

type FinanceTimelineDuplicateSample = {
  tenantId: string;
  sourceEventId: string;
  count: number;
  activityIds: string[];
  metadataDiffers: boolean;
  rows: FinanceTimelineReadinessSample[];
};

type FinanceTimelineReadinessCategory = 'hardened' | 'eligible' | 'duplicates' | 'ambiguous' | 'missingSourceEventId' | 'all';

type FinanceTimelineReadinessItem = FinanceTimelineReadinessSample | FinanceTimelineDuplicateSample;

export type FinanceTimelineIdempotencyReadinessReport = {
  operationId: string;
  tenantId: string | null;
  readOnly: true;
  category: FinanceTimelineReadinessCategory;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  status: 'ready' | 'duplicates_found' | 'ambiguous' | 'missing_source_ids' | 'empty';
  counts: {
    hardenedRows: number;
    eligibleUniqueHistoricalRows: number;
    duplicateGroups: number;
    ambiguousGroups: number;
    missingSourceEventIdRows: number;
    sampledRows: number;
  };
  samples: {
    eligible: FinanceTimelineReadinessSample[];
    duplicates: FinanceTimelineDuplicateSample[];
    ambiguous: FinanceTimelineDuplicateSample[];
    missingSourceEventId: FinanceTimelineReadinessSample[];
  };
  items: FinanceTimelineReadinessItem[];
  futureBackfillRecommendation: {
    canBackfillAutomatically: boolean;
    requiresOperatorReview: boolean;
    recommendedNextAction: 'none' | 'prepare_backfill_plan' | 'review_duplicates' | 'fix_missing_source_ids';
  };
  warnings: string[];
  generatedAt: string;
};

export type FinanceTimelineIdempotencyBackfillPlanInput = FinanceTimelineIdempotencyReadinessInput & {
  operatorReason: string;
};

export type FinanceTimelineIdempotencyBackfillPlan = {
  operationId: string;
  dryRun: true;
  executed: false;
  planHash: string;
  operatorReason: string;
  tenantId: string | null;
  filters: {
    fromCreatedAt: string | null;
    toCreatedAt: string | null;
    sourceEventTypes: string[];
    limit: number;
    cursor: string | null;
  };
  approvalGates: {
    requiresOperatorApproval: boolean;
    requiresDuplicateResolution: boolean;
    requiresMissingSourceIdResolution: boolean;
    requiresBackfillMutationEndpoint: boolean;
  };
  counts: {
    wouldMarkVersion1: number;
    blockedDuplicateGroups: number;
    blockedAmbiguousGroups: number;
    blockedMissingSourceEventIdRows: number;
    alreadyHardenedRows: number;
    unsafeRows: number;
  };
  recommendation: 'ready_for_operator_review' | 'blocked_by_duplicates' | 'blocked_by_missing_source_ids' | 'no_action_needed';
  samples?: {
    wouldMarkVersion1: FinanceTimelineReadinessSample[];
    blockedDuplicateGroups: FinanceTimelineDuplicateSample[];
    blockedAmbiguousGroups: FinanceTimelineDuplicateSample[];
    blockedMissingSourceEventIdRows: FinanceTimelineReadinessSample[];
    alreadyHardenedRows: FinanceTimelineReadinessSample[];
  };
  warnings: string[];
  generatedAt: string;
};

export type FinanceTimelineIdempotencyBackfillExecuteInput = {
  tenantId: string;
  operatorId: string;
  operatorReason: string;
  approvalReason: string;
  dryRunOperationId?: string | null;
  planHash: string;
  activityIds: string[];
  limit?: number;
  execute: boolean;
  confirmation: string;
};

export type FinanceTimelineIdempotencyBackfillExecuteReport = {
  operationId: string;
  executed: boolean;
  dryRunRequired: true;
  tenantId: string;
  operatorId: string;
  operatorReason: string;
  approvalReason: string;
  dryRunOperationId: string | null;
  planHash: string;
  counts: {
    requested: number;
    validatedEligible: number;
    updated: number;
    alreadyHardened: number;
    blockedDuplicate: number;
    blockedAmbiguous: number;
    blockedMissingSourceEventId: number;
    blockedUnsafe: number;
    failed: number;
  };
  blocked: Array<{ activityId: string; reason: string; sourceEventId?: string | null }>;
  updatedActivityIds: string[];
  warnings: string[];
  errors: string[];
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'completed_with_warnings' | 'failed' | 'blocked';
};

export type FinanceTimelineBackfillAuditRecord = {
  operationId: string | null;
  correlationId: string | null;
  status: string | null;
  counts: Record<string, unknown>;
  createdAt: string | null;
  completedAt: string | null;
};

export type FinanceTimelineBackfillConsistencyReport = {
  operationId: string;
  readOnly: true;
  tenantId: string;
  filters: {
    operationId: string | null;
    correlationId: string | null;
    fromCreatedAt: string | null;
    toCreatedAt: string | null;
    status: string | null;
    limit: number;
    cursor: string | null;
  };
  summary: {
    checkedOperations: number;
    consistent: number;
    countMismatches: number;
    missingAudit: number;
    missingActivityMetadata: number;
    inconclusive: number;
  };
  items: Array<{
    operationId: string;
    correlationId: string | null;
    auditStatus: 'completed' | 'completed_with_warnings' | 'blocked' | 'failed' | 'unknown';
    auditUpdatedCount: number | null;
    activityBackfilledCount: number;
    activityAlreadyHardenedCount: number | null;
    status: 'CONSISTENT' | 'COUNT_MISMATCH' | 'AUDIT_MISSING' | 'ACTIVITY_METADATA_MISSING' | 'INCONCLUSIVE';
    warnings: string[];
    createdAt: string | null;
    completedAt: string | null;
    samples?: Array<{
      activityId: string;
      tenantId: string;
      sourceEventId: string | null;
      sourceEventType: string | null;
      createdAt: string | null;
      projectionIdempotencyVersion: number | null;
    }>;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  warnings: string[];
  generatedAt: string;
};

export type FinanceTimelineBackfillConsistencyInput = {
  tenantId: string;
  operationId?: string | null;
  correlationId?: string | null;
  fromCreatedAt?: string | null;
  toCreatedAt?: string | null;
  status?: string | null;
  limit?: number;
  cursor?: string | null;
  includeSamples?: boolean;
  auditRecords: FinanceTimelineBackfillAuditRecord[] | null;
  auditNextCursor?: string | null;
  auditWarning?: string | null;
};

export type FinanceTimelineBackfillOrphanAuditLookupResult = {
  found: boolean | null;
  warning?: string;
};

export type FinanceTimelineBackfillOrphanReportInput = {
  tenantId: string;
  operationId?: string | null;
  fromBackfilledAt?: string | null;
  toBackfilledAt?: string | null;
  status?: string | null;
  limit?: number;
  cursor?: string | null;
  includeSamples?: boolean;
  auditLookup: (operationId: string) => Promise<FinanceTimelineBackfillOrphanAuditLookupResult>;
};

export type FinanceTimelineBackfillOrphanReport = {
  operationId: string;
  readOnly: true;
  mode: 'orphan-metadata';
  tenantId: string;
  filters: {
    operationId: string | null;
    fromBackfilledAt: string | null;
    toBackfilledAt: string | null;
    status: string | null;
    limit: number;
    cursor: string | null;
  };
  summary: {
    scannedActivityRows: number;
    uniqueBackfillOperationIds: number;
    matchedAuditOperations: number;
    orphanOperationIds: number;
    orphanActivityRows: number;
    inconclusive: number;
  };
  items: Array<{
    backfillOperationId: string;
    activityCount: number;
    auditFound: false;
    status: 'AUDIT_MISSING' | 'INCONCLUSIVE';
    firstBackfilledAt: string | null;
    lastBackfilledAt: string | null;
    sampleActivityIds: string[];
    sampleSourceEventIds: string[];
    warnings: string[];
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  warnings: string[];
  generatedAt: string;
};

function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberField(source: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function eventPayload(event: FinanceTimelineEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' ? event.payload : {};
}

function eventMetadata(event: FinanceTimelineEvent): Record<string, unknown> {
  const payload = eventPayload(event);
  const nested = payload.metadata;
  return {
    ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
    ...(nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : {}),
  };
}

function metadataFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const metadata = payload.metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

function timelineEventFromSourceEvent(event: FinanceSourceEvent): FinanceTimelineEvent {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const metadata = metadataFromPayload(payload);
  return {
    id: event.eventId,
    type: event.eventType,
    tenantId: event.tenantId,
    occurredAt: event.occurredAt ?? undefined,
    payload: {
      ...payload,
      aggregateId: stringField(payload, 'aggregateId') ?? event.aggregateId ?? undefined,
      occurredAt: stringField(payload, 'occurredAt') ?? event.occurredAt ?? undefined,
      correlationId: stringField(payload, 'correlationId') ?? event.correlationId ?? undefined,
      metadata: {
        ...metadata,
        sourceEventId: stringField(metadata, 'sourceEventId') ?? event.eventId,
        transitionLedgerId: stringField(metadata, 'transitionLedgerId') ?? event.transitionLedgerId ?? undefined,
        correlationId: stringField(metadata, 'correlationId') ?? event.correlationId ?? undefined,
        idempotencyKey: stringField(metadata, 'idempotencyKey') ?? event.idempotencyKey ?? undefined,
        source: stringField(metadata, 'source') ?? event.source ?? undefined,
      },
    },
  };
}

function emptyReplayCounts(): FinanceTimelineReplayReport['counts'] {
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

function aggregateType(type: string): 'quote' | 'rfq' | 'drq' | 'order' {
  if (type.startsWith('rfq.')) return 'rfq';
  if (type.startsWith('drq.') || type === 'quote.discount_request.created') return 'drq';
  if (type.startsWith('order.')) return 'order';
  return 'quote';
}

function aggregateId(type: string, payload: Record<string, unknown>): string | undefined {
  return (
    stringField(payload, 'aggregateId') ??
    stringField(payload, 'quoteId') ??
    stringField(payload, 'rfqId') ??
    stringField(payload, 'discountRequestId') ??
    stringField(payload, 'drqId') ??
    stringField(payload, 'orderId') ??
    (aggregateType(type) === 'quote' ? stringField(payload, 'id') : undefined)
  );
}

function sourceEventId(event: FinanceTimelineEvent, _type: string, payload: Record<string, unknown>, metadata: Record<string, unknown>): string | undefined {
  return (
    stringField(metadata, 'sourceEventId') ??
    event.id ??
    stringField(payload, 'eventId') ??
    stringField(metadata, 'eventId') ??
    stringField(metadata, 'transitionLedgerId')
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

function titleForEvent(type: string, payload: Record<string, unknown>): string {
  const quoteNumber = stringField(payload, 'quoteNumber');
  const rfqNumber = stringField(payload, 'rfqNumber');
  const label = quoteNumber ?? rfqNumber;
  const suffix = label ? ` ${label}` : '';

  switch (type) {
    case 'rfq.created':
      return `RFQ${suffix} created`;
    case 'rfq.submitted_for_review':
      return `RFQ${suffix} submitted for review`;
    case 'rfq.review_started':
      return `RFQ${suffix} review started`;
    case 'rfq.reviewed':
      return `RFQ${suffix} reviewed`;
    case 'rfq.returned':
      return `RFQ${suffix} returned for changes`;
    case 'rfq.ready_for_quote':
      return `RFQ${suffix} ready for quote`;
    case 'rfq.responded':
      return `RFQ${suffix} response recorded`;
    case 'rfq.cancelled':
      return `RFQ${suffix} cancelled`;
    case 'rfq.converted_to_quote':
      return `RFQ${suffix} converted to quote`;
    case 'quote.created_from_rfq':
      return `Quote${suffix} created from RFQ`;
    case 'quote.revision_created':
      return `Quote${suffix} revision created`;
    case 'quote.submitted_for_approval':
      return `Quote${suffix} submitted for approval`;
    case 'quote.approved':
      return `Quote${suffix} approved`;
    case 'quote.rejected':
      return `Quote${suffix} rejected`;
    case 'quote.sent':
      return `Quote${suffix} sent to customer`;
    case 'quote.signature_requested':
      return `Quote${suffix} signature requested`;
    case 'quote.signed':
      return `Quote${suffix} signed`;
    case 'quote.accepted':
      return `Quote${suffix} accepted`;
    case 'quote.expired':
      return `Quote${suffix} expired`;
    case 'quote.voided':
      return `Quote${suffix} voided`;
    case 'quote.converted_to_order':
      return `Quote${suffix} converted to order`;
    case 'drq.requested':
    case 'quote.discount_request.created':
      return `Discount request${suffix} submitted`;
    case 'drq.approved':
      return `Discount request${suffix} approved`;
    case 'drq.rejected':
      return `Discount request${suffix} rejected`;
    case 'order.created':
    case 'order.created_from_quote':
      return `Order${stringField(payload, 'orderNumber') ? ` ${stringField(payload, 'orderNumber')}` : ''} created from quote`;
    default:
      return type.replaceAll('_', ' ');
  }
}

function descriptionForEvent(payload: Record<string, unknown>): string {
  const status = stringField(payload, 'status');
  const currency = stringField(payload, 'currency');
  const amount = numberField(payload, 'totalAmount') ?? numberField(payload, 'total');
  const amountText = amount !== undefined ? `${amount}${currency ? ` ${currency}` : ''}` : undefined;
  const reason = stringField(payload, 'reason') ?? stringField(payload, 'reasonCode');
  return [status ? `Status: ${status}` : undefined, amountText ? `Value: ${amountText}` : undefined, reason ? `Reason: ${reason}` : undefined]
    .filter(Boolean)
    .join(' | ');
}

export async function projectFinanceTimelineEvent(
  prisma: Pick<CrmPrisma, 'activity'>,
  event: FinanceTimelineEvent
): Promise<ProjectionResult> {
  const type = event.type;
  if (!type || !FINANCE_TIMELINE_EVENTS.includes(type as FinanceTimelineEventType)) {
    return { status: 'ignored', reason: 'unsupported_event' };
  }

  const payload = eventPayload(event);
  const metadata = eventMetadata(event);
  const tenantId = event.tenantId ?? stringField(payload, 'tenantId') ?? stringField(metadata, 'tenantId');
  if (!tenantId) return { status: 'ignored', reason: 'missing_tenant' };

  const accountId = stringField(payload, 'accountId');
  const contactId = stringField(payload, 'contactId');
  const dealId = stringField(payload, 'dealId') ?? stringField(payload, 'opportunityId');
  if (!accountId && !contactId && !dealId) {
    return { status: 'ignored', reason: 'missing_crm_anchor' };
  }

  const sourceId = sourceEventId(event, type, payload, metadata);
  if (!sourceId) return { status: 'ignored', reason: 'missing_source_event_id' };

  const existing = await prisma.activity.findFirst({
    where: {
      tenantId,
      customFields: {
        path: ['sourceEventId'],
        equals: sourceId,
      },
    },
    select: { id: true },
  } as never);
  if (existing) return { status: 'duplicate', sourceEventId: sourceId };

  const actorId = stringField(payload, 'actorId') ?? stringField(metadata, 'actorId') ?? 'system';
  const occurredAt = stringField(payload, 'occurredAt') ?? event.occurredAt ?? new Date().toISOString();
  const aggregate = aggregateType(type);
  const aggregateIdentifier = aggregateId(type, payload);
  try {
    const activity = await prisma.activity.create({
      data: {
        tenantId,
        ownerId: actorId,
        accountId,
        contactId,
        dealId,
        type: 'NOTE',
        subject: titleForEvent(type, payload),
        description: descriptionForEvent(payload) || null,
        status: 'COMPLETED',
        priority: 'NORMAL',
        createdAt: new Date(occurredAt),
        updatedAt: new Date(),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: sourceId,
          sourceEventType: type,
          aggregateId: aggregateIdentifier,
          aggregateType: aggregate,
          sourceAggregateId: aggregateIdentifier,
          sourceAggregateType: aggregate,
          sourceEventVersion: Number(metadata.eventVersion ?? payload.sourceEventVersion ?? 1),
          transitionLedgerId: stringField(metadata, 'transitionLedgerId'),
          correlationId: stringField(metadata, 'correlationId') ?? stringField(payload, 'correlationId'),
          projectionVersion: 1,
          projectionIdempotencyVersion: 1,
          approvalRequestId: stringField(metadata, 'approvalRequestId'),
          quoteId: stringField(payload, 'quoteId'),
          rfqId: stringField(payload, 'rfqId'),
          drqId: stringField(payload, 'discountRequestId') ?? stringField(payload, 'drqId'),
          orderId: stringField(payload, 'orderId'),
          quoteNumber: stringField(payload, 'quoteNumber'),
          rfqNumber: stringField(payload, 'rfqNumber'),
          status: stringField(payload, 'status'),
          totalAmount: numberField(payload, 'totalAmount') ?? numberField(payload, 'total'),
          currency: stringField(payload, 'currency'),
        },
      },
      select: { id: true },
    } as never) as { id: string };

    return { status: 'projected', activityId: activity.id, sourceEventId: sourceId };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: 'duplicate', sourceEventId: sourceId };
    }
    throw error;
  }
}

export async function startFinanceTimelineConsumer(prisma: CrmPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('crm-service.finance-timeline');
  await consumer.subscribe([TOPICS.QUOTES]);

  for (const eventType of FINANCE_TIMELINE_EVENTS) {
    consumer.on(eventType, async (event) => {
      await projectFinanceTimelineEvent(prisma, event as FinanceTimelineEvent);
    });
  }

  await consumer.start();
  return consumer;
}

export async function getFinanceTimelineHealth(
  prisma: Pick<CrmPrisma, 'activity'>,
  tenantId: string | null,
  staleAfterMinutes = 15
): Promise<FinanceTimelineHealth> {
  const where = {
    ...(tenantId ? { tenantId } : {}),
    customFields: {
      path: ['timelineSource'],
      equals: 'finance',
    },
  };
  const [projectedEventCount, latest] = await Promise.all([
    prisma.activity.count({ where } as never),
    prisma.activity.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { createdAt: true, updatedAt: true, customFields: true },
    } as never),
  ]);

  if (!latest) {
    return {
      status: 'empty',
      projectedEventCount,
      latestProjectedAt: null,
      latestSourceEventTime: null,
      latestSourceEventId: null,
      lagMs: null,
      consumerFreshnessMs: null,
      staleAfterMinutes,
      consumerGroup: 'crm-service.finance-timeline',
      dlqTopic: 'nexus.finance.quotes.dlq',
    };
  }

  const row = latest as { createdAt?: Date; updatedAt?: Date; customFields?: Record<string, unknown> | null };
  const projectedAt = row.updatedAt ?? null;
  const sourceEventTime = row.createdAt ?? null;
  const ageMs = projectedAt ? Date.now() - projectedAt.getTime() : Number.POSITIVE_INFINITY;
  const warningMs = staleAfterMinutes * 60_000;
  const degradedMs = warningMs * 2;
  return {
    status: ageMs > degradedMs ? 'degraded' : ageMs > warningMs ? 'stale' : 'healthy',
    projectedEventCount,
    latestProjectedAt: projectedAt?.toISOString() ?? null,
    latestSourceEventTime: sourceEventTime?.toISOString() ?? null,
    latestSourceEventId: stringField(row.customFields ?? undefined, 'sourceEventId') ?? null,
    lagMs: projectedAt && sourceEventTime ? Math.max(0, projectedAt.getTime() - sourceEventTime.getTime()) : null,
    consumerFreshnessMs: Number.isFinite(ageMs) ? ageMs : null,
    staleAfterMinutes,
    consumerGroup: 'crm-service.finance-timeline',
    dlqTopic: 'nexus.finance.quotes.dlq',
  };
}

function readinessSample(row: FinanceTimelineActivityRow): FinanceTimelineReadinessSample {
  const customFields = row.customFields ?? {};
  return {
    activityId: row.id,
    tenantId: row.tenantId,
    sourceEventId: stringField(customFields, 'sourceEventId') ?? null,
    sourceEventType: stringField(customFields, 'sourceEventType') ?? null,
    aggregateId: stringField(customFields, 'aggregateId') ?? stringField(customFields, 'sourceAggregateId') ?? null,
    aggregateType: stringField(customFields, 'aggregateType') ?? stringField(customFields, 'sourceAggregateType') ?? null,
    accountId: row.accountId ?? null,
    contactId: row.contactId ?? null,
    dealId: row.dealId ?? null,
    createdAt: dateIso(row.createdAt),
    projectionIdempotencyVersion: numberOrNull(customFields.projectionIdempotencyVersion),
  };
}

function importantMetadataSignature(row: FinanceTimelineActivityRow): string {
  const sample = readinessSample(row);
  const customFields = row.customFields ?? {};
  return JSON.stringify({
    sourceEventType: sample.sourceEventType,
    aggregateId: sample.aggregateId,
    aggregateType: sample.aggregateType,
    accountId: sample.accountId,
    contactId: sample.contactId,
    dealId: sample.dealId,
    occurredAt: stringField(customFields, 'occurredAt') ?? null,
  });
}

function emptyReadinessSamples(): FinanceTimelineIdempotencyReadinessReport['samples'] {
  return {
    eligible: [],
    duplicates: [],
    ambiguous: [],
    missingSourceEventId: [],
  };
}

function encodeReadinessCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeReadinessCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };
    if (typeof decoded.offset !== 'number' || !Number.isInteger(decoded.offset) || decoded.offset < 0) {
      throw new Error('Invalid readiness cursor');
    }
    return decoded.offset;
  } catch {
    const invalidCursor = new Error('Invalid readiness cursor');
    (invalidCursor as { code?: string }).code = 'INVALID_READINESS_CURSOR';
    throw invalidCursor;
  }
}

function normalizedReadinessCategory(value: unknown): FinanceTimelineReadinessCategory {
  return value === 'hardened'
    || value === 'eligible'
    || value === 'duplicates'
    || value === 'ambiguous'
    || value === 'missingSourceEventId'
    || value === 'all'
    ? value
    : 'all';
}

function pageItems<T>(items: T[], offset: number, limit: number): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const page = items.slice(offset, offset + limit);
  const hasMore = offset + limit < items.length;
  return {
    items: page,
    nextCursor: hasMore ? encodeReadinessCursor(offset + limit) : null,
    hasMore,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createPlanHash(input: {
  tenantId: string | null;
  filters: FinanceTimelineIdempotencyBackfillPlan['filters'];
  eligible: FinanceTimelineReadinessSample[];
  duplicateGroups: number;
  ambiguousGroups: number;
  missingSourceEventIdRows: number;
}): string {
  const payload = {
    planVersion: 1,
    tenantId: input.tenantId,
    filters: {
      fromCreatedAt: input.filters.fromCreatedAt,
      toCreatedAt: input.filters.toCreatedAt,
      sourceEventTypes: [...input.filters.sourceEventTypes].sort(),
    },
    eligible: input.eligible
      .map((row) => ({ activityId: row.activityId, sourceEventId: row.sourceEventId }))
      .sort((a, b) => a.activityId.localeCompare(b.activityId)),
    duplicateGroups: input.duplicateGroups,
    ambiguousGroups: input.ambiguousGroups,
    missingSourceEventIdRows: input.missingSourceEventIdRows,
  };
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

export async function analyzeFinanceTimelineIdempotencyReadiness(
  prisma: Pick<CrmPrisma, 'activity'>,
  input: FinanceTimelineIdempotencyReadinessInput = {}
): Promise<FinanceTimelineIdempotencyReadinessReport> {
  const generatedAt = new Date();
  const limit = Math.min(Math.max(Number(input.limit ?? 100), 1), 500);
  const scanLimit = 500;
  const category = normalizedReadinessCategory(input.category);
  const cursorOffset = decodeReadinessCursor(input.cursor);
  const sourceEventTypes = input.sourceEventTypes?.filter((value) => typeof value === 'string' && value.length > 0) ?? [];
  const createdAt: Record<string, Date> = {};
  if (input.fromCreatedAt) createdAt.gte = new Date(input.fromCreatedAt);
  if (input.toCreatedAt) createdAt.lte = new Date(input.toCreatedAt);
  const rows = await prisma.activity.findMany({
    where: {
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      customFields: {
        path: ['timelineSource'],
        equals: 'finance',
      },
    },
    orderBy: { createdAt: 'asc' },
    take: scanLimit,
    select: {
      id: true,
      tenantId: true,
      accountId: true,
      contactId: true,
      dealId: true,
      createdAt: true,
      customFields: true,
    },
  } as never) as FinanceTimelineActivityRow[];

  const filteredRows = sourceEventTypes.length > 0
    ? rows.filter((row) => sourceEventTypes.includes(stringField(row.customFields ?? undefined, 'sourceEventType') ?? ''))
    : rows;

  const counts = {
    hardenedRows: 0,
    eligibleUniqueHistoricalRows: 0,
    duplicateGroups: 0,
    ambiguousGroups: 0,
    missingSourceEventIdRows: 0,
    sampledRows: 0,
  };
  const samples = input.includeSamples ? emptyReadinessSamples() : emptyReadinessSamples();
  const hardenedItems: FinanceTimelineReadinessSample[] = [];
  const eligibleItems: FinanceTimelineReadinessSample[] = [];
  const duplicateItems: FinanceTimelineDuplicateSample[] = [];
  const ambiguousItems: FinanceTimelineDuplicateSample[] = [];
  const missingItems: FinanceTimelineReadinessSample[] = [];
  const bySource = new Map<string, FinanceTimelineActivityRow[]>();

  for (const row of filteredRows) {
    const customFields = row.customFields ?? {};
    const sourceId = stringField(customFields, 'sourceEventId');
    if (numberOrNull(customFields.projectionIdempotencyVersion) === 1) {
      counts.hardenedRows += 1;
      hardenedItems.push(readinessSample(row));
    }
    if (!sourceId) {
      counts.missingSourceEventIdRows += 1;
      const sample = readinessSample(row);
      missingItems.push(sample);
      if (input.includeSamples) samples.missingSourceEventId.push(sample);
      continue;
    }
    const key = `${row.tenantId}:${sourceId}`;
    bySource.set(key, [...(bySource.get(key) ?? []), row]);
  }

  for (const groupRows of bySource.values()) {
    const sourceId = stringField(groupRows[0]?.customFields ?? undefined, 'sourceEventId');
    if (!sourceId) continue;

    if (groupRows.length === 1) {
      const row = groupRows[0];
      const version = numberOrNull(row.customFields?.projectionIdempotencyVersion);
      if (version !== 1) {
        counts.eligibleUniqueHistoricalRows += 1;
        const sample = readinessSample(row);
        eligibleItems.push(sample);
        if (input.includeSamples) samples.eligible.push(sample);
      }
      continue;
    }

    const signatures = new Set(groupRows.map(importantMetadataSignature));
    const duplicateSample: FinanceTimelineDuplicateSample = {
      tenantId: groupRows[0]?.tenantId ?? '',
      sourceEventId: sourceId,
      count: groupRows.length,
      activityIds: groupRows.map((row) => row.id),
      metadataDiffers: signatures.size > 1,
      rows: groupRows.map(readinessSample),
    };
    counts.duplicateGroups += 1;
    duplicateItems.push(duplicateSample);
    if (input.includeSamples) samples.duplicates.push(duplicateSample);
    if (duplicateSample.metadataDiffers) {
      counts.ambiguousGroups += 1;
      ambiguousItems.push(duplicateSample);
      if (input.includeSamples) samples.ambiguous.push(duplicateSample);
    }
  }

  counts.sampledRows =
    samples.eligible.length +
    samples.duplicates.length +
    samples.ambiguous.length +
    samples.missingSourceEventId.length;

  const status: FinanceTimelineIdempotencyReadinessReport['status'] = filteredRows.length === 0
    ? 'empty'
    : counts.ambiguousGroups > 0
      ? 'ambiguous'
      : counts.duplicateGroups > 0
        ? 'duplicates_found'
        : counts.missingSourceEventIdRows > 0
          ? 'missing_source_ids'
          : 'ready';

  const requiresOperatorReview = counts.duplicateGroups > 0 || counts.ambiguousGroups > 0 || counts.missingSourceEventIdRows > 0;
  const recommendedNextAction: FinanceTimelineIdempotencyReadinessReport['futureBackfillRecommendation']['recommendedNextAction'] =
    counts.duplicateGroups > 0 || counts.ambiguousGroups > 0
      ? 'review_duplicates'
      : counts.missingSourceEventIdRows > 0
        ? 'fix_missing_source_ids'
        : counts.eligibleUniqueHistoricalRows > 0
          ? 'prepare_backfill_plan'
          : 'none';
  const allItems: FinanceTimelineReadinessItem[] = [
    ...hardenedItems,
    ...eligibleItems,
    ...duplicateItems,
    ...ambiguousItems,
    ...missingItems,
  ];
  const categoryItems: FinanceTimelineReadinessItem[] = category === 'hardened'
    ? hardenedItems
    : category === 'eligible'
      ? eligibleItems
      : category === 'duplicates'
        ? duplicateItems
        : category === 'ambiguous'
          ? ambiguousItems
          : category === 'missingSourceEventId'
            ? missingItems
            : allItems;
  const paged = pageItems(categoryItems, cursorOffset, limit);

  return {
    operationId: `financeTimeline-idempotency-readiness:${generatedAt.getTime()}`,
    tenantId: input.tenantId ?? null,
    readOnly: true,
    category,
    limit,
    cursor: input.cursor ?? null,
    nextCursor: paged.nextCursor,
    hasMore: paged.hasMore,
    status,
    counts,
    samples,
    items: paged.items,
    futureBackfillRecommendation: {
      canBackfillAutomatically: counts.eligibleUniqueHistoricalRows > 0 && !requiresOperatorReview,
      requiresOperatorReview,
      recommendedNextAction,
    },
    warnings: [
      ...(rows.length === scanLimit ? [`Report capped at ${scanLimit} finance timeline rows; use filters to narrow large tenants.`] : []),
      'Report is read-only; no Activity rows were updated or deleted.',
    ],
    generatedAt: generatedAt.toISOString(),
  };
}

export async function createFinanceTimelineIdempotencyBackfillPlan(
  prisma: Pick<CrmPrisma, 'activity'>,
  input: FinanceTimelineIdempotencyBackfillPlanInput
): Promise<FinanceTimelineIdempotencyBackfillPlan> {
  const reason = input.operatorReason.trim();
  if (!reason) {
    throw new Error('Backfill plan operatorReason is required');
  }
  const report = await analyzeFinanceTimelineIdempotencyReadiness(prisma, {
    ...input,
    category: 'all',
    includeSamples: true,
  });
  const duplicateBlocked = report.counts.duplicateGroups > 0 || report.counts.ambiguousGroups > 0;
  const missingBlocked = report.counts.missingSourceEventIdRows > 0;
  const recommendation: FinanceTimelineIdempotencyBackfillPlan['recommendation'] = duplicateBlocked
    ? 'blocked_by_duplicates'
    : missingBlocked
      ? 'blocked_by_missing_source_ids'
      : report.counts.eligibleUniqueHistoricalRows > 0
        ? 'ready_for_operator_review'
        : 'no_action_needed';

  return {
    operationId: `financeTimeline-idempotency-backfill-plan:${Date.now()}`,
    dryRun: true,
    executed: false,
    planHash: createPlanHash({
      tenantId: input.tenantId ?? null,
      filters: {
        fromCreatedAt: input.fromCreatedAt ?? null,
        toCreatedAt: input.toCreatedAt ?? null,
        sourceEventTypes: input.sourceEventTypes ?? [],
        limit: report.limit,
        cursor: input.cursor ?? null,
      },
      eligible: report.samples.eligible,
      duplicateGroups: report.counts.duplicateGroups,
      ambiguousGroups: report.counts.ambiguousGroups,
      missingSourceEventIdRows: report.counts.missingSourceEventIdRows,
    }),
    operatorReason: reason,
    tenantId: input.tenantId ?? null,
    filters: {
      fromCreatedAt: input.fromCreatedAt ?? null,
      toCreatedAt: input.toCreatedAt ?? null,
      sourceEventTypes: input.sourceEventTypes ?? [],
      limit: report.limit,
      cursor: input.cursor ?? null,
    },
    approvalGates: {
      requiresOperatorApproval: true,
      requiresDuplicateResolution: report.counts.duplicateGroups > 0,
      requiresMissingSourceIdResolution: report.counts.missingSourceEventIdRows > 0,
      requiresBackfillMutationEndpoint: true,
    },
    counts: {
      wouldMarkVersion1: report.counts.eligibleUniqueHistoricalRows,
      blockedDuplicateGroups: report.counts.duplicateGroups,
      blockedAmbiguousGroups: report.counts.ambiguousGroups,
      blockedMissingSourceEventIdRows: report.counts.missingSourceEventIdRows,
      alreadyHardenedRows: report.counts.hardenedRows,
      unsafeRows: report.counts.missingSourceEventIdRows,
    },
    recommendation,
    samples: input.includeSamples
      ? {
        wouldMarkVersion1: report.samples.eligible,
        blockedDuplicateGroups: report.samples.duplicates,
        blockedAmbiguousGroups: report.samples.ambiguous,
        blockedMissingSourceEventIdRows: report.samples.missingSourceEventId,
        alreadyHardenedRows: report.items.filter((item): item is FinanceTimelineReadinessSample =>
          'activityId' in item && item.projectionIdempotencyVersion === 1
        ),
      }
      : undefined,
    warnings: [
      ...report.warnings,
      'Backfill plan is dry-run only; no Activity rows were updated, deleted, or marked as projectionIdempotencyVersion = 1.',
      'Future mutation requires an explicit operator-approved backfill endpoint.',
    ],
    generatedAt: new Date().toISOString(),
  };
}

function emptyBackfillExecuteCounts(): FinanceTimelineIdempotencyBackfillExecuteReport['counts'] {
  return {
    requested: 0,
    validatedEligible: 0,
    updated: 0,
    alreadyHardened: 0,
    blockedDuplicate: 0,
    blockedAmbiguous: 0,
    blockedMissingSourceEventId: 0,
    blockedUnsafe: 0,
    failed: 0,
  };
}

function addBlocked(
  report: Pick<FinanceTimelineIdempotencyBackfillExecuteReport, 'blocked' | 'counts'>,
  activityId: string,
  reason: string,
  sourceEventId?: string | null
) {
  report.blocked.push({ activityId, reason, sourceEventId });
}

function sanitizedReason(reason: string): string {
  return reason.trim().slice(0, 240);
}

function normalizedAuditStatus(value: string | null | undefined): 'completed' | 'completed_with_warnings' | 'blocked' | 'failed' | 'unknown' {
  return value === 'completed' || value === 'completed_with_warnings' || value === 'blocked' || value === 'failed'
    ? value
    : 'unknown';
}

function backfillActivityWhere(tenantId: string, operationId: string) {
  return {
    tenantId,
    AND: [
      { customFields: { path: ['timelineSource'], equals: 'finance' } },
      { customFields: { path: ['projectionIdempotencyVersion'], equals: 1 } },
      { customFields: { path: ['idempotencyBackfillOperationId'], equals: operationId } },
    ],
  };
}

function sanitizedBackfillSample(row: FinanceTimelineActivityRow) {
  const customFields = row.customFields ?? {};
  return {
    activityId: row.id,
    tenantId: row.tenantId,
    sourceEventId: stringField(customFields, 'sourceEventId') ?? null,
    sourceEventType: stringField(customFields, 'sourceEventType') ?? null,
    createdAt: dateIso(row.createdAt),
    projectionIdempotencyVersion: numberOrNull(customFields.projectionIdempotencyVersion),
  };
}

function backfillMetadataOperationId(row: FinanceTimelineActivityRow): string | null {
  return stringField(row.customFields ?? undefined, 'idempotencyBackfillOperationId') ?? null;
}

function backfilledAtIso(row: FinanceTimelineActivityRow): string | null {
  return dateIso(stringField(row.customFields ?? undefined, 'idempotencyBackfilledAt'));
}

function isBackfillMetadataCandidate(row: FinanceTimelineActivityRow): boolean {
  const customFields = row.customFields ?? {};
  return stringField(customFields, 'timelineSource') === 'finance'
    && numberOrNull(customFields.projectionIdempotencyVersion) === 1
    && Boolean(stringField(customFields, 'idempotencyBackfillOperationId'));
}

function isWithinBackfilledAtRange(row: FinanceTimelineActivityRow, fromBackfilledAt?: string | null, toBackfilledAt?: string | null): boolean {
  const backfilledAt = backfilledAtIso(row);
  if (!backfilledAt) return false;
  const time = new Date(backfilledAt).getTime();
  if (fromBackfilledAt && time < new Date(fromBackfilledAt).getTime()) return false;
  if (toBackfilledAt && time > new Date(toBackfilledAt).getTime()) return false;
  return true;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

export async function analyzeFinanceTimelineBackfillOrphanMetadata(
  prisma: Pick<CrmPrisma, 'activity'>,
  input: FinanceTimelineBackfillOrphanReportInput
): Promise<FinanceTimelineBackfillOrphanReport> {
  const generatedAt = new Date();
  const limit = Math.min(Math.max(Number(input.limit ?? 100), 1), 500);
  const cursorOffset = decodeReadinessCursor(input.cursor);
  const report: FinanceTimelineBackfillOrphanReport = {
    operationId: `financeTimeline-idempotency-backfill-orphans:${generatedAt.getTime()}`,
    readOnly: true,
    mode: 'orphan-metadata',
    tenantId: input.tenantId,
    filters: {
      operationId: input.operationId ?? null,
      fromBackfilledAt: input.fromBackfilledAt ?? null,
      toBackfilledAt: input.toBackfilledAt ?? null,
      status: input.status ?? null,
      limit,
      cursor: input.cursor ?? null,
    },
    summary: {
      scannedActivityRows: 0,
      uniqueBackfillOperationIds: 0,
      matchedAuditOperations: 0,
      orphanOperationIds: 0,
      orphanActivityRows: 0,
      inconclusive: 0,
    },
    items: [],
    nextCursor: null,
    hasMore: false,
    warnings: [
      'Orphan metadata report is page-scoped and read-only.',
      'No Activity rows, audit records, finance aggregates, projections, or events were mutated.',
    ],
    generatedAt: generatedAt.toISOString(),
  };

  const rows = await prisma.activity.findMany({
    where: {
      tenantId: input.tenantId,
      AND: [
        { customFields: { path: ['timelineSource'], equals: 'finance' } },
        { customFields: { path: ['projectionIdempotencyVersion'], equals: 1 } },
        ...(input.operationId ? [{ customFields: { path: ['idempotencyBackfillOperationId'], equals: input.operationId } }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    skip: cursorOffset,
    take: limit + 1,
    select: {
      id: true,
      tenantId: true,
      createdAt: true,
      customFields: true,
    },
  } as never) as FinanceTimelineActivityRow[];

  const pageRows = rows
    .filter(isBackfillMetadataCandidate)
    .filter((row) => {
      if (!input.fromBackfilledAt && !input.toBackfilledAt) return true;
      return isWithinBackfilledAtRange(row, input.fromBackfilledAt, input.toBackfilledAt);
    })
    .slice(0, limit);
  report.hasMore = rows.length > limit;
  report.nextCursor = report.hasMore ? encodeReadinessCursor(cursorOffset + limit) : null;
  report.summary.scannedActivityRows = pageRows.length;

  const byOperation = new Map<string, FinanceTimelineActivityRow[]>();
  for (const row of pageRows) {
    const operationId = backfillMetadataOperationId(row);
    if (!operationId) continue;
    byOperation.set(operationId, [...(byOperation.get(operationId) ?? []), row]);
  }
  report.summary.uniqueBackfillOperationIds = byOperation.size;

  for (const [operationId, operationRows] of byOperation) {
    const lookup = await input.auditLookup(operationId);
    if (lookup.warning && !report.warnings.includes(lookup.warning)) report.warnings.push(lookup.warning);
    if (lookup.found === true) {
      report.summary.matchedAuditOperations += 1;
      continue;
    }

    const sortedBackfilledAt = operationRows
      .map(backfilledAtIso)
      .filter((value): value is string => Boolean(value))
      .sort();
    const firstBackfilledAt = sortedBackfilledAt[0] ?? null;
    const lastBackfilledAt = sortedBackfilledAt[sortedBackfilledAt.length - 1] ?? null;
    const status: FinanceTimelineBackfillOrphanReport['items'][number]['status'] =
      lookup.found === false ? 'AUDIT_MISSING' : 'INCONCLUSIVE';
    if (status === 'AUDIT_MISSING') {
      report.summary.orphanOperationIds += 1;
      report.summary.orphanActivityRows += operationRows.length;
    } else {
      report.summary.inconclusive += 1;
    }

    report.items.push({
      backfillOperationId: operationId,
      activityCount: operationRows.length,
      auditFound: false,
      status,
      firstBackfilledAt,
      lastBackfilledAt,
      sampleActivityIds: input.includeSamples ? operationRows.slice(0, 10).map((row) => row.id) : [],
      sampleSourceEventIds: input.includeSamples ? uniqueStrings(operationRows.slice(0, 10).map((row) => stringField(row.customFields ?? undefined, 'sourceEventId'))) : [],
      warnings: [
        ...(lookup.warning ? [lookup.warning] : []),
        ...(status === 'AUDIT_MISSING'
          ? ['Activity metadata references this backfill operation, but no matching audit record was returned.']
          : ['Audit lookup could not conclusively verify this backfill operation.']),
      ],
    });
  }

  return report;
}

export async function compareFinanceTimelineBackfillAuditConsistency(
  prisma: Pick<CrmPrisma, 'activity'>,
  input: FinanceTimelineBackfillConsistencyInput
): Promise<FinanceTimelineBackfillConsistencyReport> {
  const generatedAt = new Date();
  const limit = Math.min(Math.max(Number(input.limit ?? 100), 1), 500);
  const report: FinanceTimelineBackfillConsistencyReport = {
    operationId: `financeTimeline-idempotency-backfill-consistency:${generatedAt.getTime()}`,
    readOnly: true,
    tenantId: input.tenantId,
    filters: {
      operationId: input.operationId ?? null,
      correlationId: input.correlationId ?? null,
      fromCreatedAt: input.fromCreatedAt ?? null,
      toCreatedAt: input.toCreatedAt ?? null,
      status: input.status ?? null,
      limit,
      cursor: input.cursor ?? null,
    },
    summary: {
      checkedOperations: 0,
      consistent: 0,
      countMismatches: 0,
      missingAudit: 0,
      missingActivityMetadata: 0,
      inconclusive: 0,
    },
    items: [],
    nextCursor: input.auditNextCursor ?? null,
    hasMore: Boolean(input.auditNextCursor),
    warnings: [
      ...(input.auditWarning ? [input.auditWarning] : []),
      'Consistency report is read-only; no Activity rows, audit records, finance aggregates, or events were mutated.',
    ],
    generatedAt: generatedAt.toISOString(),
  };

  if (input.auditWarning || input.auditRecords === null) {
    report.summary.checkedOperations = 1;
    report.summary.inconclusive = 1;
    report.items.push({
      operationId: input.operationId ?? 'unknown',
      correlationId: input.correlationId ?? null,
      auditStatus: 'unknown',
      auditUpdatedCount: null,
      activityBackfilledCount: 0,
      activityAlreadyHardenedCount: null,
      status: 'INCONCLUSIVE',
      warnings: ['Audit history could not be read from audit-consumer.'],
      createdAt: null,
      completedAt: null,
    });
    return report;
  }

  if (input.auditRecords.length === 0 && input.operationId) {
    const activityBackfilledCount = await prisma.activity.count({
      where: backfillActivityWhere(input.tenantId, input.operationId),
    } as never);
    report.summary.checkedOperations = 1;
    if (activityBackfilledCount > 0) {
      report.summary.missingAudit = 1;
      report.items.push({
        operationId: input.operationId,
        correlationId: input.correlationId ?? null,
        auditStatus: 'unknown',
        auditUpdatedCount: null,
        activityBackfilledCount,
        activityAlreadyHardenedCount: null,
        status: 'AUDIT_MISSING',
        warnings: ['Activity metadata references this backfill operation, but no matching audit record was returned.'],
        createdAt: null,
        completedAt: null,
      });
    } else {
      report.summary.inconclusive = 1;
      report.items.push({
        operationId: input.operationId,
        correlationId: input.correlationId ?? null,
        auditStatus: 'unknown',
        auditUpdatedCount: null,
        activityBackfilledCount: 0,
        activityAlreadyHardenedCount: null,
        status: 'INCONCLUSIVE',
        warnings: ['No audit record or Activity metadata was found for this operation.'],
        createdAt: null,
        completedAt: null,
      });
    }
    return report;
  }

  for (const audit of input.auditRecords.slice(0, limit)) {
    const operationId = audit.operationId ?? '';
    if (!operationId) {
      report.summary.checkedOperations += 1;
      report.summary.inconclusive += 1;
      report.items.push({
        operationId: 'unknown',
        correlationId: audit.correlationId,
        auditStatus: normalizedAuditStatus(audit.status),
        auditUpdatedCount: null,
        activityBackfilledCount: 0,
        activityAlreadyHardenedCount: null,
        status: 'INCONCLUSIVE',
        warnings: ['Audit record did not include an operationId.'],
        createdAt: audit.createdAt,
        completedAt: audit.completedAt,
      });
      continue;
    }

    const activityBackfilledCount = await prisma.activity.count({
      where: backfillActivityWhere(input.tenantId, operationId),
    } as never);
    const samples = input.includeSamples
      ? await prisma.activity.findMany({
        where: backfillActivityWhere(input.tenantId, operationId),
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: {
          id: true,
          tenantId: true,
          createdAt: true,
          customFields: true,
        },
      } as never) as FinanceTimelineActivityRow[]
      : [];
    const auditStatus = normalizedAuditStatus(audit.status);
    const auditUpdatedCount = numberOrNull(audit.counts.updated);
    const itemWarnings: string[] = [];
    let status: FinanceTimelineBackfillConsistencyReport['items'][number]['status'] = 'INCONCLUSIVE';

    if (auditStatus === 'failed' || auditStatus === 'blocked') {
      status = 'INCONCLUSIVE';
      itemWarnings.push('Failed or blocked audit records do not imply a completed Activity metadata update.');
    } else if (auditUpdatedCount === null) {
      status = 'INCONCLUSIVE';
      itemWarnings.push('Audit record is missing sanitized counts.updated.');
    } else if (auditUpdatedCount === activityBackfilledCount) {
      status = 'CONSISTENT';
    } else if (auditUpdatedCount > 0 && activityBackfilledCount === 0) {
      status = 'ACTIVITY_METADATA_MISSING';
    } else {
      status = 'COUNT_MISMATCH';
    }

    report.summary.checkedOperations += 1;
    if (status === 'CONSISTENT') report.summary.consistent += 1;
    if (status === 'COUNT_MISMATCH') report.summary.countMismatches += 1;
    if (status === 'ACTIVITY_METADATA_MISSING') report.summary.missingActivityMetadata += 1;
    if (status === 'INCONCLUSIVE') report.summary.inconclusive += 1;

    report.items.push({
      operationId,
      correlationId: audit.correlationId,
      auditStatus,
      auditUpdatedCount,
      activityBackfilledCount,
      activityAlreadyHardenedCount: null,
      status,
      warnings: itemWarnings,
      createdAt: audit.createdAt,
      completedAt: audit.completedAt,
      ...(input.includeSamples ? { samples: samples.map(sanitizedBackfillSample) } : {}),
    });
  }

  return report;
}

export async function executeFinanceTimelineIdempotencyBackfill(
  prisma: Pick<CrmPrisma, 'activity'>,
  input: FinanceTimelineIdempotencyBackfillExecuteInput
): Promise<FinanceTimelineIdempotencyBackfillExecuteReport> {
  const startedAt = new Date();
  const operationId = `financeTimeline-idempotency-backfill-execute:${startedAt.getTime()}`;
  const counts = emptyBackfillExecuteCounts();
  const report: FinanceTimelineIdempotencyBackfillExecuteReport = {
    operationId,
    executed: false,
    dryRunRequired: true,
    tenantId: input.tenantId,
    operatorId: input.operatorId,
    operatorReason: sanitizedReason(input.operatorReason),
    approvalReason: sanitizedReason(input.approvalReason),
    dryRunOperationId: input.dryRunOperationId ?? null,
    planHash: input.planHash,
    counts,
    blocked: [],
    updatedActivityIds: [],
    warnings: [],
    errors: [],
    startedAt: startedAt.toISOString(),
    completedAt: startedAt.toISOString(),
    status: 'failed',
  };
  const requestedIds = Array.from(new Set(input.activityIds.filter((id) => typeof id === 'string' && id.length > 0)));
  counts.requested = requestedIds.length;

  if (!input.execute) report.errors.push('execute must be true.');
  if (input.confirmation !== 'BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY') report.errors.push('Confirmation phrase is required.');
  if (!input.operatorReason.trim()) report.errors.push('operatorReason is required.');
  if (!input.approvalReason.trim()) report.errors.push('approvalReason is required.');
  if (!input.planHash.trim()) report.errors.push('planHash is required.');
  if (requestedIds.length === 0) report.errors.push('activityIds are required.');
  if (requestedIds.length > 500 || requestedIds.length > Math.min(Math.max(Number(input.limit ?? 500), 1), 500)) {
    report.errors.push('activityIds exceeds the allowed execution limit.');
  }
  if (report.errors.length > 0) {
    report.completedAt = new Date().toISOString();
    report.status = 'failed';
    return report;
  }

  const currentPlan = await createFinanceTimelineIdempotencyBackfillPlan(prisma, {
    tenantId: input.tenantId,
    operatorReason: input.operatorReason,
    includeSamples: true,
    limit: 500,
  });
  const requestedRows = await prisma.activity.findMany({
    where: { id: { in: requestedIds } },
    select: {
      id: true,
      tenantId: true,
      accountId: true,
      contactId: true,
      dealId: true,
      createdAt: true,
      customFields: true,
    },
  } as never) as FinanceTimelineActivityRow[];
  const rowById = new Map(requestedRows.map((row) => [row.id, row]));
  const financeRows = await prisma.activity.findMany({
    where: {
      tenantId: input.tenantId,
      customFields: {
        path: ['timelineSource'],
        equals: 'finance',
      },
    },
    select: {
      id: true,
      tenantId: true,
      accountId: true,
      contactId: true,
      dealId: true,
      createdAt: true,
      customFields: true,
    },
  } as never) as FinanceTimelineActivityRow[];
  const financeBySource = new Map<string, FinanceTimelineActivityRow[]>();
  for (const row of financeRows) {
    const sourceId = stringField(row.customFields ?? undefined, 'sourceEventId');
    if (!sourceId) continue;
    financeBySource.set(sourceId, [...(financeBySource.get(sourceId) ?? []), row]);
  }
  const eligibleIds = new Set(currentPlan.samples?.wouldMarkVersion1.map((row) => row.activityId) ?? []);

  for (const id of requestedIds) {
    const row = rowById.get(id);
    if (!row) {
      counts.blockedUnsafe += 1;
      addBlocked(report, id, 'not_found');
      continue;
    }
    const customFields = row.customFields ?? {};
    const sourceId = stringField(customFields, 'sourceEventId') ?? null;
    if (row.tenantId !== input.tenantId) {
      counts.blockedUnsafe += 1;
      addBlocked(report, id, 'tenant_mismatch', sourceId);
      continue;
    }
    if (stringField(customFields, 'timelineSource') !== 'finance') {
      counts.blockedUnsafe += 1;
      addBlocked(report, id, 'not_finance_timeline', sourceId);
      continue;
    }
    if (!sourceId) {
      counts.blockedMissingSourceEventId += 1;
      addBlocked(report, id, 'missing_source_event_id');
      continue;
    }
    if (numberOrNull(customFields.projectionIdempotencyVersion) === 1) {
      counts.alreadyHardened += 1;
      addBlocked(report, id, 'already_hardened', sourceId);
      continue;
    }
    const group = financeBySource.get(sourceId) ?? [];
    if (group.length > 1) {
      const signatures = new Set(group.map(importantMetadataSignature));
      counts.blockedDuplicate += 1;
      if (signatures.size > 1) counts.blockedAmbiguous += 1;
      addBlocked(report, id, signatures.size > 1 ? 'ambiguous_duplicate_source_event_id' : 'duplicate_source_event_id', sourceId);
      continue;
    }
    if (!eligibleIds.has(id)) {
      counts.blockedUnsafe += 1;
      addBlocked(report, id, 'not_in_current_eligible_plan', sourceId);
      continue;
    }
    counts.validatedEligible += 1;
  }

  if (currentPlan.planHash !== input.planHash) {
    report.errors.push('Plan hash does not match current finance timeline idempotency state.');
    report.completedAt = new Date().toISOString();
    report.status = 'blocked';
    return report;
  }

  const hardBlocked =
    counts.blockedDuplicate +
    counts.blockedAmbiguous +
    counts.blockedMissingSourceEventId +
    counts.blockedUnsafe;
  if (hardBlocked > 0) {
    report.completedAt = new Date().toISOString();
    report.status = 'blocked';
    return report;
  }

  for (const id of requestedIds) {
    const row = rowById.get(id);
    if (!row || !eligibleIds.has(id)) continue;
    try {
      const customFields = row.customFields ?? {};
      await prisma.activity.update({
        where: { id },
        data: {
          customFields: {
            ...customFields,
            projectionIdempotencyVersion: 1,
            idempotencyBackfilledAt: startedAt.toISOString(),
            idempotencyBackfillOperationId: operationId,
            idempotencyBackfillReason: sanitizedReason(input.operatorReason),
          },
        },
      } as never);
      counts.updated += 1;
      report.updatedActivityIds.push(id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        counts.blockedDuplicate += 1;
        addBlocked(report, id, 'unique_constraint_conflict', stringField(row.customFields ?? undefined, 'sourceEventId') ?? null);
        continue;
      }
      counts.failed += 1;
      report.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  report.executed = true;
  report.completedAt = new Date().toISOString();
  report.status = counts.failed > 0
    ? 'failed'
    : report.blocked.length > 0 || counts.alreadyHardened > 0
      ? 'completed_with_warnings'
      : 'completed';
  if (counts.alreadyHardened > 0) {
    report.warnings.push('Some requested rows were already hardened and were treated as no-op.');
  }
  return report;
}

export async function getFinanceTimelineReplayReport(
  prisma: Pick<CrmPrisma, 'activity'>,
  input: FinanceTimelineReplayInput
): Promise<FinanceTimelineReplayReport> {
  const startedAt = new Date();
  const dryRun = input.dryRun !== false;
  const execute = input.execute === true && !dryRun;
  const limit = Math.min(Math.max(Number(input.limit ?? 100), 1), 500);
  const eventSource = input.eventSource
    ? await input.eventSource({
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
      if (!FINANCE_TIMELINE_EVENTS.includes(sourceEvent.eventType as FinanceTimelineEventType)) {
        counts.skipped += 1;
        warnings.push(`Skipped unsupported finance event type ${sourceEvent.eventType}`);
        continue;
      }

      const replayEvent = timelineEventFromSourceEvent(sourceEvent);
      const payload = eventPayload(replayEvent);
      const metadata = eventMetadata(replayEvent);
      const tenantId = replayEvent.tenantId ?? stringField(payload, 'tenantId') ?? stringField(metadata, 'tenantId');
      if (!tenantId) {
        counts.skipped += 1;
        warnings.push(`Skipped ${sourceEvent.eventId} because tenantId is missing`);
        continue;
      }

      const accountId = stringField(payload, 'accountId');
      const contactId = stringField(payload, 'contactId');
      const dealId = stringField(payload, 'dealId') ?? stringField(payload, 'opportunityId');
      if (!accountId && !contactId && !dealId) {
        counts.skipped += 1;
        warnings.push(`Skipped ${sourceEvent.eventId} because CRM anchors are missing`);
        continue;
      }

      const sourceId = sourceEventId(replayEvent, replayEvent.type ?? sourceEvent.eventType, payload, metadata);
      if (!sourceId) {
        counts.skipped += 1;
        warnings.push(`Skipped ${sourceEvent.eventId} because sourceEventId is missing`);
        continue;
      }

      const duplicate = await prisma.activity.findFirst({
        where: {
          tenantId,
          customFields: {
            path: ['sourceEventId'],
            equals: sourceId,
          },
        },
        select: { id: true },
      } as never);
      if (duplicate) {
        counts.duplicate += 1;
        continue;
      }

      if (execute) {
        try {
          const result = await projectFinanceTimelineEvent(prisma, replayEvent);
          if (result.status === 'projected') {
            counts.processed += 1;
            counts.created += 1;
          } else if (result.status === 'duplicate') {
            counts.duplicate += 1;
          } else {
            counts.skipped += 1;
            warnings.push(`Skipped ${sourceEvent.eventId}: ${result.reason}`);
          }
        } catch (error) {
          counts.failed += 1;
          errors.push(error instanceof Error ? error.message : String(error));
        }
      } else {
        counts.created += 1;
      }
    }
  }

  const completedAt = new Date();
  const status: FinanceTimelineReplayReport['status'] = !eventSource.available
    ? 'unsupported'
    : dryRun
      ? 'dry_run'
      : errors.length > 0
        ? 'failed'
        : warnings.length > 0
          ? 'completed_with_warnings'
          : 'completed';
  return {
    operationId: `financeTimeline-replay:${startedAt.getTime()}`,
    projection: 'financeTimeline',
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
}
