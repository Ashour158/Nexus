import type { ActorContext, EngineContext } from './context.js';

export function createTestActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: 'usr_test',
    tenantId: 'tenant_test',
    roles: ['admin'],
    permissions: ['*'],
    ...overrides,
  };
}

export function createTestEngineContext(overrides: Partial<EngineContext> = {}): EngineContext {
  const actor = overrides.audit?.actor ?? createTestActor();
  return {
    audit: {
      actor,
      source: 'api',
      requestId: 'req_test',
      correlationId: 'corr_test',
      ...overrides.audit,
    },
    now: new Date('2026-01-01T00:00:00.000Z'),
    idempotencyKey: 'idem_test',
    ...overrides,
  };
}
