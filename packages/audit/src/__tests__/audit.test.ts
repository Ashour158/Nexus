import { describe, it, expect } from 'vitest';
import {
  AuditLogger,
  createInternalOperationAuditEvent,
  publishInternalOperationAuditWithPolicy,
  resolveAuditStrictness,
} from '../index.js';

describe('AuditLogger', () => {
  it('creates an audit logger with default topic', () => {
    const kafka = { producer: () => ({ connect: () => Promise.resolve(), disconnect: () => Promise.resolve(), send: () => Promise.resolve() }) } as any;
    const logger = new AuditLogger(kafka);
    expect(logger).toBeDefined();
  });
});

describe('internal operation audit contract', () => {
  it('builds a sanitized append-only audit event for replay operations', () => {
    const event = createInternalOperationAuditEvent({
      tenantId: 'tenant_1',
      operatorId: 'ops_1',
      operationType: 'quoteProjection.replay',
      operationId: 'quoteProjection-replay:1',
      dryRun: false,
      executed: true,
      reason: 'Reconcile projection after outage',
      filters: { aggregateId: 'quote_1' },
      counts: { candidates: 1, processed: 1 },
      status: 'completed',
      warnings: [],
      errors: [],
      correlationId: 'corr_1',
      startedAt: '2026-05-20T10:00:00.000Z',
      completedAt: '2026-05-20T10:00:01.000Z',
      sourceService: 'deals-service',
      targetProjection: 'quoteProjection',
      sourceEventIds: ['evt_1'],
      sourceEvents: [{ eventId: 'evt_1', payload: { customer: 'sensitive' } }],
    } as never);

    expect(event.action).toBe('quoteProjection.replay');
    expect(event.resource).toBe('internal_operation');
    expect(event.resourceId).toBe('quoteProjection-replay:1');
    expect(event.actorId).toBe('ops_1');
    expect(event.actorType).toBe('service');
    expect(event.metadata).toEqual(expect.objectContaining({
      operationId: 'quoteProjection-replay:1',
      dryRun: false,
      executed: true,
      reason: 'Reconcile projection after outage',
      filters: { aggregateId: 'quote_1' },
      counts: { candidates: 1, processed: 1 },
      status: 'completed',
      sourceService: 'deals-service',
      targetProjection: 'quoteProjection',
      sourceEventIds: ['evt_1'],
    }));
    expect(JSON.stringify(event.metadata)).not.toContain('sensitive');
    expect(JSON.stringify(event.metadata)).not.toContain('sourceEvents');
  });

  it('defaults audit strictness to warn', () => {
    expect(resolveAuditStrictness('quoteProjection.replay', {})).toBe('warn');
  });

  it('uses per-operation strictness overrides before the global default', () => {
    expect(resolveAuditStrictness('cpq.transition.reconcile', {
      AUDIT_STRICTNESS_DEFAULT: 'warn',
      AUDIT_STRICTNESS_CPQ_RECONCILE: 'strict',
    })).toBe('strict');
    expect(resolveAuditStrictness('quoteProjection.replay', {
      AUDIT_STRICTNESS_DEFAULT: 'strict',
      AUDIT_STRICTNESS_QUOTE_PROJECTION_REPLAY: 'warn',
    })).toBe('warn');
  });

  it('falls back to warn for invalid audit strictness config', () => {
    const warnings: string[] = [];
    expect(resolveAuditStrictness('financeTimeline.replay', {
      AUDIT_STRICTNESS_FINANCE_TIMELINE_REPLAY: 'required',
    }, (message) => warnings.push(message))).toBe('warn');
    expect(warnings[0]).toContain('AUDIT_STRICTNESS_FINANCE_TIMELINE_REPLAY');
  });

  it('returns a warning when policy is warn and audit publishing fails', async () => {
    const producer = {
      publish: async () => {
        throw new Error('audit offline');
      },
    };

    const result = await publishInternalOperationAuditWithPolicy(producer, {
      tenantId: 'tenant_1',
      operatorId: 'ops_1',
      operationType: 'quoteProjection.replay',
      operationId: 'op_1',
      sourceService: 'deals-service',
    }, { strictness: 'warn' });

    expect(result).toEqual(expect.objectContaining({
      published: false,
      strictness: 'warn',
      warning: 'Audit publish failed: audit offline',
    }));
  });

  it('throws an audit-required error when policy is strict and audit publishing fails', async () => {
    const producer = {
      publish: async () => {
        throw new Error('audit offline');
      },
    };

    await expect(publishInternalOperationAuditWithPolicy(producer, {
      tenantId: 'tenant_1',
      operatorId: 'ops_1',
      operationType: 'quoteProjection.replay',
      operationId: 'op_1',
      sourceService: 'deals-service',
    }, { strictness: 'strict' })).rejects.toMatchObject({
      code: 'AUDIT_REQUIRED_FAILED',
      message: 'Audit publish failed: audit offline',
    });
  });
});
