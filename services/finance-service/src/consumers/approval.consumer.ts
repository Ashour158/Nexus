import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { EngineContext } from '@nexus/domain-core';
import type { FinancePrisma } from '../prisma.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

type ApprovalEventLike = {
  tenantId: string;
  payload: Record<string, unknown>;
};

function noOpProducer(): NexusProducer {
  return {
    publish: async () => undefined,
  } as unknown as NexusProducer;
}

function systemContext(event: ApprovalEventLike, actorId: string): EngineContext {
  return {
    audit: {
      actor: {
        userId: actorId,
        tenantId: event.tenantId,
        roles: ['SYSTEM'],
        permissions: ['*'],
      },
      requestId: String(event.payload.eventId ?? event.payload.approvalRequestId ?? event.payload.recordId ?? 'approval-callback'),
      correlationId: String(event.payload.correlationId ?? event.payload.eventId ?? event.payload.recordId ?? 'approval-callback'),
      source: 'system',
    },
    now: new Date(),
  };
}

function commercialAuthority(prisma: FinancePrisma, producer: NexusProducer) {
  return createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes: createQuotesService(prisma, producer),
    discountRequests: createDiscountRequestsService(prisma, producer),
    pricingEngine: new CpqPricingEngine(prisma),
    checkDiscountApproval,
  });
}

export async function handleApprovalApproved(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: ApprovalEventLike,
  producer: NexusProducer = noOpProducer()
) {
  const payload = event.payload;
  const tenantId = event.tenantId;
  const module = String(payload.module ?? '');
  const recordId = String(payload.recordId ?? '');
  const entityType = String(payload.entityType ?? '');
  const entityId = String(payload.entityId ?? '');

  if (module !== 'quote.discount_request' && entityType !== 'quote') {
    log.info({ module, entityType, entityId }, 'Approval event not for quote; ignoring');
    return;
  }
  const discountRequest = module === 'quote.discount_request' && recordId
    ? await prisma.discountRequest.findFirst({ where: { id: recordId, tenantId } })
    : null;
  const quoteId = entityId || discountRequest?.quoteId || recordId;

  const actorId = String(payload.approvedById ?? payload.actorId ?? 'approval-service');
  const authority = commercialAuthority(prisma, producer);
  const ctx = systemContext(event, actorId);
  const idempotencyKey = String(payload.eventId ?? `${recordId || quoteId}.approved`);
  const correlationId = String(payload.correlationId ?? payload.eventId ?? (recordId || quoteId));
  const sourceEventId = String(payload.eventId ?? '');

  const updated = discountRequest
    ? (await authority.approveDiscountRequestFromApproval(ctx, discountRequest.id, {
        approvalRequestId: recordId || String(payload.approvalRequestId ?? ''),
        idempotencyKey,
        correlationId,
        sourceEventId,
        approvedById: actorId,
      })).quote
    : await authority.approveQuoteFromApproval(ctx, quoteId, {
        approvalRequestId: recordId || String(payload.approvalRequestId ?? ''),
        idempotencyKey,
        correlationId,
        sourceEventId,
        approvedById: actorId,
      });

  log.info(
    { quoteId, tenantId, newStatus: updated.status },
    'CPQ entity transitioned after approval completion'
  );
}

export async function handleApprovalRejected(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: ApprovalEventLike,
  producer: NexusProducer = noOpProducer()
) {
  const payload = event.payload;
  const tenantId = event.tenantId;
  const module = String(payload.module ?? '');
  const recordId = String(payload.recordId ?? '');
  const entityType = String(payload.entityType ?? '');
  const entityId = String(payload.entityId ?? '');

  if (module !== 'quote.discount_request' && (entityType !== 'quote' || !entityId)) return;
  const discountRequest = module === 'quote.discount_request' && recordId
    ? await prisma.discountRequest.findFirst({ where: { id: recordId, tenantId } })
    : null;
  const quoteId = entityId || discountRequest?.quoteId || recordId;
  const actorId = String(payload.rejectedById ?? payload.actorId ?? 'approval-service');
  const reason = String(payload.comment ?? payload.rejectionReason ?? 'Rejected by approval workflow');
  const authority = commercialAuthority(prisma, producer);
  const ctx = systemContext(event, actorId);
  const idempotencyKey = String(payload.eventId ?? `${recordId || quoteId}.rejected`);
  const correlationId = String(payload.correlationId ?? payload.eventId ?? (recordId || quoteId));
  const sourceEventId = String(payload.eventId ?? '');

  const updated = discountRequest
    ? await authority.rejectDiscountRequestFromApproval(ctx, discountRequest.id, {
        approvalRequestId: recordId || String(payload.approvalRequestId ?? ''),
        idempotencyKey,
        correlationId,
        sourceEventId,
        rejectedById: actorId,
        rejectionReason: reason,
      })
    : await authority.rejectQuoteFromApproval(ctx, quoteId, {
        approvalRequestId: recordId || String(payload.approvalRequestId ?? ''),
        idempotencyKey,
        correlationId,
        sourceEventId,
        rejectedById: actorId,
        rejectionReason: reason,
      });

  log.info(
    { quoteId, tenantId, newStatus: updated.status },
    'CPQ entity rejected after approval rejection'
  );
}

/**
 * Listens to approval-service events and auto-transitions quotes
 * that were pending approval when the approval completes.
 */
export async function startApprovalConsumer(
  prisma: FinancePrisma,
  log: LoggerLike,
  producer: NexusProducer = noOpProducer()
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('finance-service.approval');

  consumer.on('approval.request.approved', async (event) => handleApprovalApproved(prisma, log, {
    tenantId: event.tenantId,
    payload: event.payload as Record<string, unknown>,
  }, producer));

  consumer.on('approval.request.rejected', async (event) => handleApprovalRejected(prisma, log, {
    tenantId: event.tenantId,
    payload: event.payload as Record<string, unknown>,
  }, producer));

  await consumer.subscribe([TOPICS.WORKFLOWS]);
  await consumer.start();
  return consumer;
}
