import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { publishInternalOperationAuditWithPolicy } from '@nexus/audit';
import type { EngineContext } from '@nexus/domain-core';
import type { NexusProducer } from '@nexus/kafka';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import type { FinancePrisma } from '../prisma.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';

const ReconcileTransitionsSchema = z.object({
  tenantId: z.string().min(1).optional(),
  olderThanMinutes: z.number().int().min(5),
  limit: z.number().int().min(1).default(100),
});

const FinanceEventsQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  aggregateType: z.string().min(1).optional(),
  aggregateId: z.string().min(1).optional(),
  fromOccurredAt: z.string().datetime().optional(),
  toOccurredAt: z.string().datetime().optional(),
  fromEventId: z.string().min(1).optional(),
  toEventId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).default(100),
});

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

function headerValue(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
}

function operatorIdFromRequest(req: FastifyRequest): string {
  return headerValue(req, 'x-operator-id') ?? 'system';
}

function systemContext(req: FastifyRequest, tenantId: string, correlationId: string): EngineContext {
  return {
    audit: {
      actor: {
        userId: 'system',
        tenantId,
        roles: ['system'],
        permissions: ['*'],
      },
      requestId: req.id,
      correlationId,
      source: 'system',
    },
    now: new Date(),
  };
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function canonicalFinanceEvent(row: Record<string, unknown>) {
  const payload = objectOf(row.payload);
  const metadata = objectOf(payload.metadata);
  const headers = objectOf(row.headers);
  const occurredAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? '');
  return {
    eventId: String(row.id),
    eventType: stringOf(row.eventType) ?? stringOf(payload.type) ?? stringOf(headers.eventType),
    tenantId: stringOf(row.tenantId) ?? stringOf(payload.tenantId),
    aggregateType: stringOf(row.aggregateType) ?? stringOf(headers.aggregateType),
    aggregateId: stringOf(row.aggregateId),
    occurredAt,
    correlationId: stringOf(row.correlationId) ?? stringOf(metadata.correlationId) ?? stringOf(payload.correlationId),
    idempotencyKey: stringOf(metadata.idempotencyKey),
    transitionLedgerId: stringOf(metadata.transitionLedgerId),
    source: stringOf(metadata.source) ?? stringOf(headers.source) ?? 'finance-service',
    payload,
  };
}

export async function registerInternalOperationsRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes: createQuotesService(prisma, producer),
    discountRequests: createDiscountRequestsService(prisma, producer),
    pricingEngine: new CpqPricingEngine(prisma),
    checkDiscountApproval,
  });

  await app.register(
    async (r) => {
      r.post('/internal/cpq/reconcile-transitions', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id },
          });
        }

        const parsed = ReconcileTransitionsSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid reconciliation request',
              details: parsed.error.flatten(),
              requestId: req.id,
            },
          });
        }

        const tenantId = parsed.data.tenantId ?? headerValue(req, 'x-tenant-id') ?? 'system';
        const correlationId = headerValue(req, 'x-correlation-id') ?? req.id;
        const result = await commercial.reconcileStuckCpqTransitions(systemContext(req, tenantId, correlationId), {
          tenantId: parsed.data.tenantId ?? headerValue(req, 'x-tenant-id'),
          olderThanMinutes: parsed.data.olderThanMinutes,
          limit: Math.min(parsed.data.limit, 500),
        });
        const data = {
          scanned: result.recovered.length,
          reconciled: result.recoveredCount,
          skipped: 0,
          failed: 0,
          results: result.recovered,
          correlationId,
          warnings: [] as string[],
        };

        try {
          const auditResult = await publishInternalOperationAuditWithPolicy(producer, {
            tenantId,
            operatorId: operatorIdFromRequest(req),
            operationType: 'cpq.transition.reconcile',
            operationId: `cpq-transition-reconcile:${correlationId}`,
            dryRun: false,
            executed: true,
            reason: 'Recover stale CPQ STARTED transitions',
            filters: {
              tenantId: parsed.data.tenantId ?? headerValue(req, 'x-tenant-id') ?? null,
              olderThanMinutes: parsed.data.olderThanMinutes,
              limit: Math.min(parsed.data.limit, 500),
            },
            counts: {
              scanned: data.scanned,
              reconciled: data.reconciled,
              skipped: data.skipped,
              failed: data.failed,
            },
            status: data.failed > 0 ? 'completed_with_warnings' : 'completed',
            warnings: data.warnings,
            errors: [],
            correlationId,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            sourceService: 'finance-service',
            targetDomain: 'cpq',
          });
          if (auditResult.warning) data.warnings.push(auditResult.warning);
        } catch (error) {
          return reply.code(500).send({
            success: false,
            error: {
              code: (error as { code?: string }).code ?? 'AUDIT_REQUIRED_FAILED',
              message: error instanceof Error ? error.message : String(error),
              requestId: req.id,
            },
            data: { ...data, status: 'audit_required_failed' },
          });
        }

        return reply.send({ success: true, data });
      });

      // ─── VIEW-TRACKING (portal → finance) ───────────────────────────────
      // Called by portal-service when a shared quote link is opened. Flips the
      // quote SENT → VIEWED (idempotently) and stamps viewedAt. Service-to-
      // service; guarded by x-service-token (no end-user JWT).
      r.post('/internal/quotes/:id/mark-viewed', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id },
          });
        }
        const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
        if (!params.success) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid quote id', requestId: req.id },
          });
        }
        const tenantId = headerValue(req, 'x-tenant-id');
        if (!tenantId) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'x-tenant-id is required', requestId: req.id },
          });
        }
        const correlationId = headerValue(req, 'x-correlation-id') ?? req.id;
        try {
          const quote = await commercial.markQuoteViewed(systemContext(req, tenantId, correlationId), params.data.id);
          return reply.send({ success: true, data: { id: quote.id, status: quote.status, viewedAt: quote.viewedAt } });
        } catch (error) {
          const code = (error as { statusCode?: number }).statusCode ?? 500;
          return reply.code(code === 404 ? 404 : 500).send({
            success: false,
            error: {
              code: (error as { name?: string }).name ?? 'MARK_VIEWED_FAILED',
              message: error instanceof Error ? error.message : String(error),
              requestId: req.id,
            },
          });
        }
      });

      r.get('/internal/cpq/observability', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id },
          });
        }

        const query = req.query as { tenantId?: string; olderThanMinutes?: string };
        const tenantId = query.tenantId ?? headerValue(req, 'x-tenant-id');
        const olderThanMinutes = Math.max(5, Number(query.olderThanMinutes ?? 15));
        const startedBefore = new Date(Date.now() - olderThanMinutes * 60_000);
        const where = {
          ...(tenantId ? { tenantId } : {}),
          status: 'STARTED',
          createdAt: { lt: startedBefore },
        };
        const staleStartedTransitions = await prisma.cpqTransitionLedger.count({ where });
        const latestTransition = await prisma.cpqTransitionLedger.findFirst({
          where: tenantId ? { tenantId } : {},
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            entity: true,
            entityId: true,
            action: true,
            status: true,
            updatedAt: true,
            correlationId: true,
            sourceEventId: true,
          },
        });

        return reply.send({
          success: true,
          data: {
            status: staleStartedTransitions > 0 ? 'degraded' : 'healthy',
            staleStartedTransitions,
            olderThanMinutes,
            latestTransition,
            reconciliationRoute: '/api/v1/internal/cpq/reconcile-transitions',
            dlqVisibility: {
              owner: 'outbox-relay',
              statsRoute: '/admin/dlq/stats',
              replayRoute: '/admin/dlq/replay',
            },
          },
        });
      });

      r.get('/internal/events/finance', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id },
          });
        }

        const parsed = FinanceEventsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid finance event query',
              details: parsed.error.flatten(),
              requestId: req.id,
            },
          });
        }

        const query = parsed.data;
        const tenantId = query.tenantId ?? headerValue(req, 'x-tenant-id');
        if (!tenantId) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'tenantId or x-tenant-id is required', requestId: req.id },
          });
        }

        const hasFilter = Boolean(
          query.eventType
          || query.aggregateType
          || query.aggregateId
          || query.fromOccurredAt
          || query.toOccurredAt
          || query.fromEventId
          || query.toEventId
        );
        if (!hasFilter) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'At least one finance event filter is required.',
              requestId: req.id,
            },
          });
        }

        const createdAt: Record<string, Date> = {};
        if (query.fromOccurredAt) createdAt.gte = new Date(query.fromOccurredAt);
        if (query.toOccurredAt) createdAt.lte = new Date(query.toOccurredAt);
        const id: Record<string, string> = {};
        if (query.fromEventId) id.gte = query.fromEventId;
        if (query.toEventId) id.lte = query.toEventId;
        const where = {
          tenantId,
          topic: 'nexus.finance.quotes',
          ...(query.eventType ? { eventType: query.eventType } : {}),
          ...(query.aggregateType ? { aggregateType: query.aggregateType } : {}),
          ...(query.aggregateId ? { aggregateId: query.aggregateId } : {}),
          ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
          ...(Object.keys(id).length > 0 ? { id } : {}),
        };

        const rows = await prisma.outboxMessage.findMany({
          where,
          take: Math.min(query.limit, 500),
          orderBy: { createdAt: 'asc' },
        });

        return reply.send({
          success: true,
          data: {
            events: rows.map((row) => canonicalFinanceEvent(row as unknown as Record<string, unknown>)),
            pageInfo: {
              limit: Math.min(query.limit, 500),
              returned: rows.length,
              hasMore: rows.length === Math.min(query.limit, 500),
            },
          },
        });
      });
    },
    { prefix: '/api/v1' }
  );
}
