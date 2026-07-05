/**
 * Service-to-service internal routes for CRM.
 * No end-user JWT — protected by `x-service-token`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { publishInternalOperationAuditWithPolicy } from '@nexus/audit';
import type { NexusProducer } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';
import {
  analyzeFinanceTimelineBackfillOrphanMetadata,
  analyzeFinanceTimelineIdempotencyReadiness,
  compareFinanceTimelineBackfillAuditConsistency,
  createFinanceTimelineIdempotencyBackfillPlan,
  executeFinanceTimelineIdempotencyBackfill,
  getFinanceTimelineHealth,
  getFinanceTimelineReplayReport,
} from '../consumers/finance-timeline.consumer.js';
import type { FinanceSourceEvent, FinanceTimelineBackfillAuditRecord, FinanceTimelineBackfillOrphanAuditLookupResult } from '../consumers/finance-timeline.consumer.js';

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

function tenantIdFromRequest(req: FastifyRequest): string | null {
  const raw = req.headers['x-tenant-id'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function operatorIdFromRequest(req: FastifyRequest): string {
  const raw = req.headers['x-operator-id'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : 'system';
}

function correlationIdFromRequest(req: FastifyRequest): string {
  const raw = req.headers['x-correlation-id'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : req.id;
}

function validationError(reply: FastifyReply, requestId: string, message: string) {
  return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message, requestId } });
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

function auditConsumerUrl(): string {
  return process.env.AUDIT_CONSUMER_URL ?? 'http://localhost:3028';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function auditRecordsFromBody(body: unknown): { records: FinanceTimelineBackfillAuditRecord[]; nextCursor: string | null } {
  const data = asRecord(asRecord(body).data);
  const pageInfo = asRecord(data.pageInfo);
  const records = Array.isArray(data.records)
    ? data.records.flatMap((row): FinanceTimelineBackfillAuditRecord[] => {
      const record = asRecord(row);
      const operationId = typeof record.operationId === 'string' ? record.operationId : null;
      return [{
        operationId,
        correlationId: typeof record.correlationId === 'string' ? record.correlationId : null,
        status: typeof record.status === 'string' ? record.status : null,
        counts: asRecord(record.counts),
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
        completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
      }];
    })
    : [];
  return {
    records,
    nextCursor: typeof pageInfo.nextCursor === 'string' ? pageInfo.nextCursor : null,
  };
}

async function fetchBackfillAuditRecords(input: {
  tenantId: string;
  operationId?: string | null;
  correlationId?: string | null;
  fromCreatedAt?: string | null;
  toCreatedAt?: string | null;
  status?: string | null;
  limit: number;
  cursor?: string | null;
}): Promise<{ records: FinanceTimelineBackfillAuditRecord[] | null; nextCursor: string | null; warning?: string }> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    return { records: null, nextCursor: null, warning: 'Internal service token is not configured; audit-consumer cannot be queried.' };
  }
  const url = new URL('/api/v1/internal/audit/internal-operations', auditConsumerUrl());
  url.searchParams.set('tenantId', input.tenantId);
  url.searchParams.set('operationType', 'financeTimeline.idempotency_backfill_execute');
  url.searchParams.set('limit', String(input.limit));
  if (input.operationId) url.searchParams.set('operationId', input.operationId);
  if (input.correlationId) url.searchParams.set('correlationId', input.correlationId);
  if (input.fromCreatedAt) url.searchParams.set('from', input.fromCreatedAt);
  if (input.toCreatedAt) url.searchParams.set('to', input.toCreatedAt);
  if (input.status) url.searchParams.set('status', input.status);
  if (input.cursor) url.searchParams.set('cursor', input.cursor);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'x-service-token': token,
        'x-tenant-id': input.tenantId,
      },
    });
    if (!response.ok) {
      return {
        records: null,
        nextCursor: null,
        warning: `Audit-consumer returned ${response.status}; consistency report is inconclusive.`,
      };
    }
    return auditRecordsFromBody(await response.json());
  } catch (error) {
    return {
      records: null,
      nextCursor: null,
      warning: `Audit-consumer request failed; consistency report is inconclusive: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function lookupBackfillAuditRecord(input: {
  tenantId: string;
  operationId: string;
}): Promise<FinanceTimelineBackfillOrphanAuditLookupResult> {
  const audit = await fetchBackfillAuditRecords({
    tenantId: input.tenantId,
    operationId: input.operationId,
    limit: 1,
  });
  if (audit.warning || audit.records === null) {
    const warning = audit.warning
      ? audit.warning.replace('consistency report is inconclusive', 'orphan metadata report is inconclusive for at least one operation')
      : 'Audit history could not be read; orphan metadata report is inconclusive for at least one operation.';
    return { found: null, warning };
  }
  if (audit.records.length === 0) return { found: false };
  const matching = audit.records.some((record) => record.operationId === input.operationId);
  if (!matching) {
    return {
      found: null,
      warning: 'Audit-consumer returned a malformed or mismatched operation record; orphan metadata report is inconclusive for at least one operation.',
    };
  }
  return { found: true };
}

export async function registerCrmInternalRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer?: Pick<NexusProducer, 'publish'>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/internal/finance-timeline/health', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }
        const query = req.query as { staleAfterMinutes?: string; tenantId?: string };
        const tenantId = query.tenantId ?? tenantIdFromRequest(req);
        const staleAfterMinutes = Math.max(1, Number(query.staleAfterMinutes ?? 15));
        const data = await getFinanceTimelineHealth(prisma, tenantId, staleAfterMinutes);
        return reply.send({ success: true, data });
      });

      r.get('/internal/finance-timeline/idempotency-readiness', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }

        const query = req.query as {
          tenantId?: string;
          fromCreatedAt?: string;
          toCreatedAt?: string;
          sourceEventType?: string | string[];
          category?: string;
          cursor?: string;
          limit?: string;
          includeSamples?: string;
        };
        const rawTypes = Array.isArray(query.sourceEventType)
          ? query.sourceEventType
          : query.sourceEventType
            ? [query.sourceEventType]
            : [];
        let data;
        try {
          data = await analyzeFinanceTimelineIdempotencyReadiness(prisma, {
            tenantId: query.tenantId ?? tenantIdFromRequest(req),
            fromCreatedAt: typeof query.fromCreatedAt === 'string' ? query.fromCreatedAt : null,
            toCreatedAt: typeof query.toCreatedAt === 'string' ? query.toCreatedAt : null,
            sourceEventTypes: rawTypes,
            category: query.category as never,
            cursor: typeof query.cursor === 'string' ? query.cursor : null,
            limit: Math.min(Math.max(Number(query.limit ?? 100), 1), 500),
            includeSamples: query.includeSamples === 'true',
          });
        } catch (error) {
          if ((error as { code?: string }).code === 'INVALID_READINESS_CURSOR') {
            return validationError(reply, req.id, 'Invalid readiness cursor');
          }
          throw error;
        }

        return reply.send({ success: true, data });
      });

      r.post('/internal/finance-timeline/idempotency-backfill-plan', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }

        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
        const operatorReason = typeof body.operatorReason === 'string' ? body.operatorReason.trim() : '';
        if (!operatorReason) {
          return validationError(reply, req.id, 'Backfill plan operatorReason is required');
        }
        const sourceEventTypes = Array.isArray(body.sourceEventTypes)
          ? body.sourceEventTypes.filter((value): value is string => typeof value === 'string')
          : [];
        let data;
        try {
          data = await createFinanceTimelineIdempotencyBackfillPlan(prisma, {
            tenantId: typeof body.tenantId === 'string' ? body.tenantId : tenantIdFromRequest(req),
            fromCreatedAt: typeof body.fromCreatedAt === 'string' ? body.fromCreatedAt : null,
            toCreatedAt: typeof body.toCreatedAt === 'string' ? body.toCreatedAt : null,
            sourceEventTypes,
            cursor: typeof body.cursor === 'string' ? body.cursor : null,
            limit: Math.min(Math.max(Number(body.limit ?? 100), 1), 500),
            includeSamples: body.includeSamples === true,
            operatorReason,
          });
        } catch (error) {
          if ((error as { code?: string }).code === 'INVALID_READINESS_CURSOR') {
            return validationError(reply, req.id, 'Invalid readiness cursor');
          }
          throw error;
        }
        if (producer) {
          try {
            const auditResult = await publishInternalOperationAuditWithPolicy(producer, {
              tenantId: data.tenantId,
              operatorId: operatorIdFromRequest(req),
              operationType: 'financeTimeline.idempotency_backfill_plan',
              operationId: data.operationId,
              dryRun: data.dryRun,
              executed: data.executed,
              reason: operatorReason,
              filters: data.filters,
              counts: data.counts,
              status: data.recommendation,
              warnings: data.warnings,
              errors: [],
              correlationId: correlationIdFromRequest(req),
              startedAt: data.generatedAt,
              completedAt: data.generatedAt,
              sourceService: 'crm-service',
              targetProjection: 'financeTimeline',
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
              data: { ...data, recommendation: 'audit_required_failed' },
            });
          }
        }
        return reply.send({ success: true, data });
      });

      r.post('/internal/finance-timeline/idempotency-backfill-execute', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }

        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
        const operatorReason = typeof body.operatorReason === 'string' ? body.operatorReason.trim() : '';
        const approvalReason = typeof body.approvalReason === 'string' ? body.approvalReason.trim() : '';
        const planHash = typeof body.planHash === 'string' ? body.planHash.trim() : '';
        const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';
        const activityIds = Array.isArray(body.activityIds)
          ? body.activityIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
          : [];
        const tenantId = typeof body.tenantId === 'string' ? body.tenantId : tenantIdFromRequest(req);
        if (!tenantId) return validationError(reply, req.id, 'tenantId is required');
        if (!operatorReason) return validationError(reply, req.id, 'operatorReason is required');
        if (!approvalReason) return validationError(reply, req.id, 'approvalReason is required');
        if (!planHash) return validationError(reply, req.id, 'planHash is required');
        if (body.execute !== true) return validationError(reply, req.id, 'execute must be true');
        if (confirmation !== 'BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY') return validationError(reply, req.id, 'Confirmation phrase is required');
        if (activityIds.length === 0) return validationError(reply, req.id, 'activityIds are required');
        if (activityIds.length > 500) return validationError(reply, req.id, 'activityIds exceeds maximum of 500');

        let data = await executeFinanceTimelineIdempotencyBackfill(prisma, {
          tenantId,
          operatorId: operatorIdFromRequest(req),
          operatorReason,
          approvalReason,
          dryRunOperationId: typeof body.dryRunOperationId === 'string' ? body.dryRunOperationId : null,
          planHash,
          activityIds,
          limit: Math.min(Math.max(Number(body.limit ?? 500), 1), 500),
          execute: body.execute === true,
          confirmation,
        });
        if (producer) {
          try {
            const auditResult = await publishInternalOperationAuditWithPolicy(producer, {
              tenantId: data.tenantId,
              operatorId: data.operatorId,
              operationType: 'financeTimeline.idempotency_backfill_execute',
              operationId: data.operationId,
              dryRun: false,
              executed: data.executed,
              reason: operatorReason,
              filters: {
                dryRunOperationId: data.dryRunOperationId,
                planHash: data.planHash,
                requestedActivityCount: data.counts.requested,
              },
              counts: data.counts,
              status: data.status,
              warnings: data.warnings,
              errors: data.errors,
              correlationId: correlationIdFromRequest(req),
              startedAt: data.startedAt,
              completedAt: data.completedAt,
              sourceService: 'crm-service',
              targetProjection: 'financeTimeline',
            });
            if (auditResult.warning) data = { ...data, warnings: [...data.warnings, auditResult.warning] };
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
        }
        return reply.send({ success: true, data });
      });

      r.get('/internal/finance-timeline/idempotency-backfill-consistency', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }

        const query = req.query as {
          mode?: string;
          tenantId?: string;
          operationId?: string;
          correlationId?: string;
          fromCreatedAt?: string;
          toCreatedAt?: string;
          fromBackfilledAt?: string;
          toBackfilledAt?: string;
          status?: string;
          limit?: string;
          cursor?: string;
          includeSamples?: string;
        };
        const tenantId = query.tenantId ?? tenantIdFromRequest(req);
        if (!tenantId) return validationError(reply, req.id, 'tenantId is required');
        const limit = Math.min(Math.max(Number(query.limit ?? 100), 1), 500);
        if (query.mode === 'orphan-metadata') {
          try {
            const data = await analyzeFinanceTimelineBackfillOrphanMetadata(prisma, {
              tenantId,
              operationId: typeof query.operationId === 'string' ? query.operationId : null,
              fromBackfilledAt: typeof query.fromBackfilledAt === 'string' ? query.fromBackfilledAt : null,
              toBackfilledAt: typeof query.toBackfilledAt === 'string' ? query.toBackfilledAt : null,
              status: typeof query.status === 'string' ? query.status : null,
              limit,
              cursor: typeof query.cursor === 'string' ? query.cursor : null,
              includeSamples: query.includeSamples === 'true',
              auditLookup: (operationId) => lookupBackfillAuditRecord({ tenantId, operationId }),
            });
            return reply.send({ success: true, data });
          } catch (error) {
            if ((error as { code?: string }).code === 'INVALID_READINESS_CURSOR') {
              return validationError(reply, req.id, 'Invalid readiness cursor');
            }
            throw error;
          }
        }
        const audit = await fetchBackfillAuditRecords({
          tenantId,
          operationId: typeof query.operationId === 'string' ? query.operationId : null,
          correlationId: typeof query.correlationId === 'string' ? query.correlationId : null,
          fromCreatedAt: typeof query.fromCreatedAt === 'string' ? query.fromCreatedAt : null,
          toCreatedAt: typeof query.toCreatedAt === 'string' ? query.toCreatedAt : null,
          status: typeof query.status === 'string' ? query.status : null,
          limit,
          cursor: typeof query.cursor === 'string' ? query.cursor : null,
        });
        const data = await compareFinanceTimelineBackfillAuditConsistency(prisma, {
          tenantId,
          operationId: typeof query.operationId === 'string' ? query.operationId : null,
          correlationId: typeof query.correlationId === 'string' ? query.correlationId : null,
          fromCreatedAt: typeof query.fromCreatedAt === 'string' ? query.fromCreatedAt : null,
          toCreatedAt: typeof query.toCreatedAt === 'string' ? query.toCreatedAt : null,
          status: typeof query.status === 'string' ? query.status : null,
          limit,
          cursor: typeof query.cursor === 'string' ? query.cursor : null,
          includeSamples: query.includeSamples === 'true',
          auditRecords: audit.records,
          auditNextCursor: audit.nextCursor,
          auditWarning: audit.warning ?? null,
        });
        return reply.send({ success: true, data });
      });

      r.post('/internal/finance-timeline/replay', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }

        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason) {
          return validationError(reply, req.id, 'Replay reason is required');
        }

        const sourceEventTypes = Array.isArray(body.sourceEventTypes)
          ? body.sourceEventTypes.filter((value): value is string => typeof value === 'string')
          : [];
        const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 500);
        const data = await getFinanceTimelineReplayReport(prisma, {
          tenantId: typeof body.tenantId === 'string' ? body.tenantId : tenantIdFromRequest(req),
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
          operatorId: operatorIdFromRequest(req),
          eventSource: createFinanceEventSourceProbe(),
        });
        if (producer) {
          try {
            const auditResult = await publishInternalOperationAuditWithPolicy(producer, {
              tenantId: data.tenantId,
              operatorId: data.operatorId,
              operationType: 'financeTimeline.replay',
              operationId: data.operationId,
              dryRun: data.dryRun,
              executed: data.executed,
              reason,
              filters: data.filters,
              counts: data.counts,
              status: data.status,
              warnings: data.warnings,
              errors: data.errors,
              correlationId: correlationIdFromRequest(req),
              startedAt: data.startedAt,
              completedAt: data.completedAt,
              sourceService: 'crm-service',
              targetProjection: 'financeTimeline',
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
        }
        return reply.send({ success: true, data });
      });

      /**
       * Contact read for the service mesh (used by comm-service sequence enroll
       * to validate a contact + resolve its email). Protected by `x-service-token`
       * — no end-user JWT. Tenant scoping is enforced from the `x-tenant-id` header.
       */
      r.get('/internal/contacts/:id', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }
        const tenantId = tenantIdFromRequest(req);
        if (!tenantId) {
          return reply.code(400).send({ success: false, error: { code: 'MISSING_X_TENANT_ID', message: 'Missing X-Tenant-Id header', requestId: req.id } });
        }
        const { id } = req.params as { id: string };
        const contact = await prisma.contact.findFirst({
          where: { id, tenantId },
          include: { emails: true },
        });
        if (!contact) {
          return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found', requestId: req.id } });
        }
        const primaryEmail =
          contact.email ??
          contact.emails.find((e) => e.isPrimary)?.email ??
          contact.emails[0]?.email ??
          null;
        return reply.send({
          success: true,
          data: { id: contact.id, email: primaryEmail },
        });
      });

      /** PATCH lead owner (used by territory-service after async routing). */
      r.patch('/internal/leads/:id/owner', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }
        const tenantId = tenantIdFromRequest(req);
        if (!tenantId) {
          return reply.code(400).send({ success: false, error: { code: 'MISSING_X_TENANT_ID', message: 'Missing X-Tenant-Id header', requestId: req.id } });
        }
        const { id } = req.params as { id: string };
        const body = req.body as { ownerId?: string; territoryId?: string; assignedTo?: string };

        const update: Record<string, unknown> = {};
        if (body.ownerId !== undefined) update.ownerId = body.ownerId;
        if (body.territoryId !== undefined) update.territoryId = body.territoryId;
        if (body.assignedTo !== undefined) update.assignedTo = body.assignedTo;

        if (Object.keys(update).length === 0) {
          return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'No fields to update', requestId: req.id } });
        }

        const existing = await prisma.lead.findFirst({ where: { id, tenantId } });
        if (!existing) {
          return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Lead not found', requestId: req.id } });
        }

        const updated = await prisma.lead.update({ where: { id }, data: update });
        return reply.send({ success: true, data: updated });
      });
    },
    { prefix: '/api/v1' }
  );
}
