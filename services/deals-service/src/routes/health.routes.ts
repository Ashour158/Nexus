import type { FastifyInstance, FastifyReply } from 'fastify';
import { registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import { publishInternalOperationAuditWithPolicy } from '@nexus/audit';
import type { NexusProducer } from '@nexus/kafka';
import type { DealsPrisma } from '../prisma.js';
import { createQuoteProjectionsService } from '../services/quote-projections.service.js';
import type { FinanceSourceEvent } from '../services/quote-projections.service.js';

function verifyServiceToken(headers: Record<string, unknown>): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && headers['x-service-token'] === expected);
}

function operatorIdFromHeaders(headers: Record<string, unknown>): string {
  const raw = headers['x-operator-id'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : 'system';
}

function correlationIdFromHeaders(headers: Record<string, unknown>, requestId: string): string {
  const raw = headers['x-correlation-id'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : requestId;
}

function validationError(reply: FastifyReply, requestId: string, message: string) {
  return reply.code(400).send({
    success: false,
    error: { code: 'VALIDATION_ERROR', message, requestId },
  });
}

function sourceEventsFromBody(events: unknown[] | undefined): FinanceSourceEvent[] {
  return (events ?? []).flatMap((event) => {
    if (!event || typeof event !== 'object') return [];
    const row = event as Record<string, unknown>;
    if (
      typeof row.eventId !== 'string'
      || typeof row.eventType !== 'string'
      || typeof row.tenantId !== 'string'
      || !row.payload
      || typeof row.payload !== 'object'
      || Array.isArray(row.payload)
    ) {
      return [];
    }
    return [{
      eventId: row.eventId,
      eventType: row.eventType,
      tenantId: row.tenantId,
      aggregateType: typeof row.aggregateType === 'string' ? row.aggregateType : null,
      aggregateId: typeof row.aggregateId === 'string' ? row.aggregateId : null,
      occurredAt: typeof row.occurredAt === 'string' ? row.occurredAt : null,
      correlationId: typeof row.correlationId === 'string' ? row.correlationId : null,
      idempotencyKey: typeof row.idempotencyKey === 'string' ? row.idempotencyKey : null,
      transitionLedgerId: typeof row.transitionLedgerId === 'string' ? row.transitionLedgerId : null,
      source: typeof row.source === 'string' ? row.source : null,
      payload: row.payload as Record<string, unknown>,
    }];
  });
}

function createFinanceEventSourceProbe() {
  const endpoint = process.env.FINANCE_EVENT_SOURCE_URL;
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!endpoint || !token) return undefined;
  return async (input: {
    tenantId?: string | null;
    fromOccurredAt?: string | null;
    toOccurredAt?: string | null;
    fromEventId?: string | null;
    toEventId?: string | null;
    aggregateId?: string | null;
    aggregateType?: string | null;
    sourceEventTypes?: string[];
    limit?: number;
  }) => {
    const url = new URL(endpoint);
    if (input.tenantId) url.searchParams.set('tenantId', input.tenantId);
    if (input.fromOccurredAt) url.searchParams.set('fromOccurredAt', input.fromOccurredAt);
    if (input.toOccurredAt) url.searchParams.set('toOccurredAt', input.toOccurredAt);
    if (input.fromEventId) url.searchParams.set('fromEventId', input.fromEventId);
    if (input.toEventId) url.searchParams.set('toEventId', input.toEventId);
    if (input.aggregateId) url.searchParams.set('aggregateId', input.aggregateId);
    if (input.aggregateType) url.searchParams.set('aggregateType', input.aggregateType);
    if (input.sourceEventTypes?.[0]) url.searchParams.set('eventType', input.sourceEventTypes[0]);
    url.searchParams.set('limit', String(Math.min(Math.max(Number(input.limit ?? 100), 1), 500)));
    const response = await fetch(url, { headers: { 'x-service-token': token } });
    if (!response.ok) {
      return { available: false, endpoint, candidateCount: null, error: `finance event-source returned ${response.status}` };
    }
    const body = await response.json() as { data?: { events?: unknown[]; pageInfo?: { returned?: number } } };
    return {
      available: true,
      endpoint,
      candidateCount: body.data?.pageInfo?.returned ?? body.data?.events?.length ?? 0,
      events: sourceEventsFromBody(body.data?.events),
    };
  };
}

export function registerDealsHealthRoutes(app: FastifyInstance, prisma?: DealsPrisma, producer?: Pick<NexusProducer, 'publish'>): void {
  const checks = prisma ? [() => checkDatabase(prisma)] : [];
  registerHealthRoutes(app, 'deals-service', checks);

  if (!prisma) return;
  const projections = createQuoteProjectionsService(prisma, { eventSource: createFinanceEventSourceProbe() });
  app.get('/api/v1/internal/quote-projections/health', async (request, reply) => {
    if (!verifyServiceToken(request.headers as Record<string, unknown>)) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: request.id },
      });
    }

    const query = request.query as { staleAfterMinutes?: string; tenantId?: string };
    const headerTenant = request.headers['x-tenant-id'];
    const tenantId = query.tenantId ?? (typeof headerTenant === 'string' ? headerTenant : null);
    const staleAfterMinutes = Math.max(1, Number(query.staleAfterMinutes ?? 15));
    const data = await projections.health(tenantId, staleAfterMinutes);
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/internal/quote-projections/rebuild-readiness', async (request, reply) => {
    if (!verifyServiceToken(request.headers as Record<string, unknown>)) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: request.id },
      });
    }

    const query = request.query as { tenantId?: string; quoteId?: string; fromEventId?: string; dryRun?: string };
    const headerTenant = request.headers['x-tenant-id'];
    const tenantId = query.tenantId ?? (typeof headerTenant === 'string' ? headerTenant : null);
    const data = await projections.rebuildReadiness({
      tenantId,
      quoteId: query.quoteId ?? null,
      fromEventId: query.fromEventId ?? null,
      dryRun: query.dryRun !== 'false',
    });
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/internal/quote-projections/replay', async (request, reply) => {
    if (!verifyServiceToken(request.headers as Record<string, unknown>)) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: request.id },
      });
    }

    const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return validationError(reply, request.id, 'Replay reason is required');
    }

    const headerTenant = request.headers['x-tenant-id'];
    const tenantId = typeof body.tenantId === 'string'
      ? body.tenantId
      : typeof headerTenant === 'string'
        ? headerTenant
        : null;
    const sourceEventTypes = Array.isArray(body.sourceEventTypes)
      ? body.sourceEventTypes.filter((value): value is string => typeof value === 'string')
      : [];
    const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 500);
    const data = await projections.governedReplay({
      tenantId,
      fromOccurredAt: typeof body.fromOccurredAt === 'string' ? body.fromOccurredAt : null,
      toOccurredAt: typeof body.toOccurredAt === 'string' ? body.toOccurredAt : null,
      fromEventId: typeof body.fromEventId === 'string' ? body.fromEventId : null,
      toEventId: typeof body.toEventId === 'string' ? body.toEventId : null,
      aggregateId: typeof body.aggregateId === 'string' ? body.aggregateId : null,
      aggregateType: typeof body.aggregateType === 'string' ? body.aggregateType : null,
      sourceEventTypes,
      limit,
      dryRun: body.dryRun === undefined ? true : body.dryRun !== false,
      execute: body.execute === true,
      reason,
      operatorId: operatorIdFromHeaders(request.headers as Record<string, unknown>),
    });
    if (producer) {
      try {
        const auditResult = await publishInternalOperationAuditWithPolicy(producer, {
          tenantId,
          operatorId: operatorIdFromHeaders(request.headers as Record<string, unknown>),
          operationType: 'quoteProjection.replay',
          operationId: data.operationId,
          dryRun: data.dryRun,
          executed: data.executed,
          reason,
          filters: data.filters,
          counts: data.counts,
          status: data.status,
          warnings: data.warnings,
          errors: data.errors,
          correlationId: correlationIdFromHeaders(request.headers as Record<string, unknown>, request.id),
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          sourceService: 'deals-service',
          targetProjection: 'quoteProjection',
        });
        if (auditResult.warning) data.warnings.push(auditResult.warning);
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: {
            code: (error as { code?: string }).code ?? 'AUDIT_REQUIRED_FAILED',
            message: error instanceof Error ? error.message : String(error),
            requestId: request.id,
          },
          data: { ...data, status: 'audit_required_failed' },
        });
      }
    }
    return reply.send({ success: true, data });
  });
}
