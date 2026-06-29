import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { EngineContext } from '@nexus/domain-core';
import type { NexusProducer } from '@nexus/kafka';
import type { JwtPayload } from '@nexus/shared-types';
import {
  BusinessRuleError,
  NexusError,
  PERMISSIONS,
  requirePermission,
} from '@nexus/service-utils';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import type { FinancePrisma } from '../prisma.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

const CpqTransitionRequestSchema = z.object({
  entity: z.enum(['rfq', 'quote', 'drq', 'order']),
  entityId: z.string().min(1),
  action: z.string().min(1),
  idempotencyKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  rfq: new Set([
    'SUBMIT_FOR_REVIEW',
    'START_REVIEW',
    'RETURN_FOR_CHANGES',
    'MARK_READY_FOR_QUOTE',
    'RECORD_RESPONSE',
    'CANCEL',
    'CONVERT_TO_QUOTE',
  ]),
  quote: new Set([
    'SUBMIT_FOR_APPROVAL',
    'SEND_TO_CUSTOMER',
    'REQUEST_SIGNATURE',
    'MARK_SIGNED',
    'CONVERT_TO_ORDER',
  ]),
  drq: new Set(['SUBMIT_FOR_APPROVAL']),
  order: new Set([]),
};

function engineContextFromJwt(requestId: string, correlationId: string, jwt: JwtPayload): EngineContext {
  return {
    audit: {
      actor: {
        userId: jwt.sub,
        tenantId: jwt.tenantId,
        email: jwt.email,
        roles: jwt.roles ?? [],
        permissions: jwt.permissions ?? [],
      },
      requestId,
      correlationId,
      source: 'api',
    },
    now: new Date(),
  };
}

function errorCode(error: NexusError): string {
  if (error instanceof BusinessRuleError) return 'BUSINESS_RULE';
  return error.code;
}

function sendNexusError(reply: FastifyReply, error: NexusError, requestId: string) {
  return reply.code(error.statusCode).send({
    success: false,
    error: {
      code: errorCode(error),
      message: error.message,
      details: error.details,
      requestId,
    },
  });
}

async function currentStatus(prisma: FinancePrisma, tenantId: string, entity: string, entityId: string) {
  if (entity === 'rfq') {
    const row = await prisma.rFQ.findFirst({ where: { id: entityId, tenantId } });
    return row?.status ?? null;
  }

  if (entity === 'quote') {
    const row = await prisma.quote.findFirst({ where: { id: entityId, tenantId } });
    return row?.status ?? null;
  }

  if (entity === 'drq') {
    const row = await prisma.discountRequest.findFirst({ where: { id: entityId, tenantId } });
    return row?.status ?? null;
  }

  return null;
}

function allowedNextActions(entity: string, nextStatus: string) {
  if (entity === 'rfq' && nextStatus === 'CONVERTED') return [];
  if (entity === 'quote' && nextStatus === 'CONVERTED') return [];
  return Array.from(ALLOWED_TRANSITIONS[entity] ?? []);
}

function transitionLedgerIdOf(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const id = (value as Record<string, unknown>).transitionLedgerId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export async function registerCpqTransitionRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const pricingEngine = new CpqPricingEngine(prisma);
  const quotes = createQuotesService(prisma, producer);
  const discountRequests = createDiscountRequestsService(prisma, producer);
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes,
    discountRequests,
    pricingEngine,
    checkDiscountApproval,
  });

  await app.register(
    async (r) => {
      r.post('/cpq/transitions', { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) }, async (request, reply) => {
        const parsed = CpqTransitionRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid CPQ transition request',
              details: parsed.error.flatten(),
              requestId: request.id,
            },
          });
        }

        const command = parsed.data;
        const transitionSet = ALLOWED_TRANSITIONS[command.entity];
        if (!transitionSet?.has(command.action)) {
          return sendNexusError(
            reply,
            new BusinessRuleError(`Invalid CPQ transition: ${command.entity}.${command.action}`),
            request.id
          );
        }

        const jwt = request.user as JwtPayload;
        const correlationId =
          String(request.headers['x-correlation-id'] ?? '').trim() ||
          String(request.headers['x-request-id'] ?? '').trim() ||
          request.id;
        const ctx = engineContextFromJwt(request.id, correlationId, jwt);

        try {
          const previousStatus = await currentStatus(prisma, jwt.tenantId, command.entity, command.entityId);
          const transitionMeta = {
            idempotencyKey: command.idempotencyKey,
            correlationId,
            source: 'api',
            sourceEventId: typeof command.payload.sourceEventId === 'string' ? command.payload.sourceEventId : undefined,
            approvalRequestId: typeof command.payload.approvalRequestId === 'string' ? command.payload.approvalRequestId : undefined,
          };

          if (command.entity === 'rfq' && command.action === 'SUBMIT_FOR_REVIEW') {
            const rfq = await commercial.submitRfqForReview(ctx, command.entityId, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: rfq.status,
                allowedNextActions: allowedNextActions(command.entity, rfq.status),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(rfq),
                entitySnapshot: rfq,
              },
            });
          }

          if (command.entity === 'rfq' && command.action === 'START_REVIEW') {
            const rfq = await commercial.startRfqReview(ctx, command.entityId, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: rfq.status,
                allowedNextActions: allowedNextActions(command.entity, rfq.status),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(rfq),
                entitySnapshot: rfq,
              },
            });
          }

          if (command.entity === 'rfq' && command.action === 'RETURN_FOR_CHANGES') {
            const reason = String(command.payload.reason ?? '').trim();
            if (!reason) throw new BusinessRuleError('RETURN_FOR_CHANGES requires reason');
            const rfq = await commercial.returnRfqForChanges(ctx, command.entityId, reason, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: rfq.status,
                allowedNextActions: allowedNextActions(command.entity, rfq.status),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(rfq),
                entitySnapshot: rfq,
              },
            });
          }

          if (command.entity === 'rfq' && command.action === 'MARK_READY_FOR_QUOTE') {
            const rfq = await commercial.markRfqReadyForQuote(ctx, command.entityId, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: rfq.status,
                allowedNextActions: allowedNextActions(command.entity, rfq.status),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(rfq),
                entitySnapshot: rfq,
              },
            });
          }

          if (command.entity === 'rfq' && command.action === 'RECORD_RESPONSE') {
            const rfq = await commercial.recordRfqResponse(ctx, command.entityId, command.payload, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: rfq.status,
                allowedNextActions: allowedNextActions(command.entity, rfq.status),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(rfq),
                entitySnapshot: rfq,
              },
            });
          }

          if (command.entity === 'rfq' && command.action === 'CANCEL') {
            const reason = String(command.payload.reason ?? '').trim();
            if (!reason) throw new BusinessRuleError('CANCEL requires reason');
            const rfq = await commercial.cancelRfq(ctx, command.entityId, reason, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: rfq.status,
                allowedNextActions: allowedNextActions(command.entity, rfq.status),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(rfq),
                entitySnapshot: rfq,
              },
            });
          }

          if (command.entity === 'rfq' && command.action === 'CONVERT_TO_QUOTE') {
            const result = await commercial.convertRfq(ctx, command.entityId, transitionMeta);
            const nextStatus = 'CONVERTED';
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus,
                allowedNextActions: allowedNextActions(command.entity, nextStatus),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(result),
                entitySnapshot: result,
              },
            });
          }

          if (command.entity === 'quote' && command.action === 'CONVERT_TO_ORDER') {
            const order = await commercial.convertQuoteToOrder(ctx, command.entityId, transitionMeta);
            const nextStatus = 'CONVERTED';
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus,
                allowedNextActions: allowedNextActions(command.entity, nextStatus),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(order),
                entitySnapshot: {
                  quoteId: command.entityId,
                  orderId: order.id,
                },
              },
            });
          }

          if (command.entity === 'quote' && command.action === 'SEND_TO_CUSTOMER') {
            const quote = await commercial.sendQuote(ctx, command.entityId, transitionMeta);
            const nextStatus = quote.status;
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus,
                allowedNextActions: allowedNextActions(command.entity, nextStatus),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(quote),
                entitySnapshot: {
                  quoteId: quote.id,
                  quoteNumber: quote.quoteNumber,
                  status: quote.status,
                },
              },
            });
          }

          if (command.entity === 'quote' && command.action === 'SUBMIT_FOR_APPROVAL') {
            const quote = await commercial.submitQuoteForApproval(ctx, command.entityId, {
              approvalRequestId: String(command.payload.approvalRequestId ?? ''),
              idempotencyKey: command.idempotencyKey,
              correlationId,
              sourceEventId: transitionMeta.sourceEventId,
            });
            const nextStatus = quote.status;
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus,
                allowedNextActions: allowedNextActions(command.entity, nextStatus),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(quote),
                entitySnapshot: {
                  quoteId: quote.id,
                  quoteNumber: quote.quoteNumber,
                  status: quote.status,
                },
              },
            });
          }

          if (command.entity === 'quote' && command.action === 'REQUEST_SIGNATURE') {
            const envelope = await commercial.sendQuoteForSignature(ctx, command.entityId, {
              documentId: typeof command.payload.documentId === 'string' ? command.payload.documentId : undefined,
              recipientName: String(command.payload.recipientName ?? ''),
              recipientEmail: String(command.payload.recipientEmail ?? ''),
              provider: String(command.payload.provider ?? 'INTERNAL'),
              expiresAt: typeof command.payload.expiresAt === 'string' ? command.payload.expiresAt : undefined,
            }, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: 'SIGNATURE_REQUESTED',
                allowedNextActions: allowedNextActions(command.entity, 'SIGNATURE_REQUESTED'),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(envelope),
                entitySnapshot: {
                  quoteId: command.entityId,
                  envelopeId: envelope.id,
                  status: envelope.status,
                },
              },
            });
          }

          if (command.entity === 'quote' && command.action === 'MARK_SIGNED') {
            const envelopeId = String(command.payload.envelopeId ?? '');
            if (!envelopeId) throw new BusinessRuleError('MARK_SIGNED requires envelopeId');
            const envelope = await commercial.updateQuoteSignature(ctx, envelopeId, { status: 'SIGNED' }, transitionMeta);
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus: 'ACCEPTED',
                allowedNextActions: allowedNextActions(command.entity, 'ACCEPTED'),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(envelope),
                entitySnapshot: {
                  quoteId: command.entityId,
                  envelopeId: envelope.id,
                  status: envelope.status,
                },
              },
            });
          }

          if (command.entity === 'drq' && command.action === 'SUBMIT_FOR_APPROVAL') {
            const discountRequest = await commercial.submitDiscountRequestForApproval(ctx, command.entityId, {
              approvalRequestId: typeof command.payload.approvalRequestId === 'string' ? command.payload.approvalRequestId : undefined,
              idempotencyKey: command.idempotencyKey,
              correlationId,
              sourceEventId: transitionMeta.sourceEventId,
            });
            const nextStatus = discountRequest.status;
            return reply.send({
              success: true,
              data: {
                entity: command.entity,
                entityId: command.entityId,
                action: command.action,
                previousStatus,
                nextStatus,
                allowedNextActions: allowedNextActions(command.entity, nextStatus),
                correlationId,
                idempotencyKey: command.idempotencyKey,
                transitionLedgerId: transitionLedgerIdOf(discountRequest),
                entitySnapshot: {
                  discountRequestId: discountRequest.id,
                  status: discountRequest.status,
                },
              },
            });
          }

          throw new BusinessRuleError(`Unsupported CPQ transition: ${command.entity}.${command.action}`);
        } catch (error) {
          if (error instanceof NexusError) {
            return sendNexusError(reply, error, request.id);
          }
          throw error;
        }
      });
    },
    { prefix: '/api/v1' }
  );
}
