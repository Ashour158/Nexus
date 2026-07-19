import { defineWorkspace } from 'vitest/config';

/**
 * Workspace roots use `services/*` (this monorepo layout). Prompt 10 referenced
 * `apps/*-service`; those paths do not exist here.
 */
export default defineWorkspace([
  {
    extends: 'services/auth-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'auth-service',
      root: './services/auth-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/crm-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'crm-service',
      root: './services/crm-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/finance-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'finance-service',
      root: './services/finance-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/comm-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'comm-service',
      root: './services/comm-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/notification-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'notification-service',
      root: './services/notification-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/workflow-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'workflow-service',
      root: './services/workflow-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/integration-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'integration-service',
      root: './services/integration-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/blueprint-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'blueprint-service',
      root: './services/blueprint-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/approval-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'approval-service',
      root: './services/approval-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/cadence-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'cadence-service',
      root: './services/cadence-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/territory-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'territory-service',
      root: './services/territory-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/chatbot-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'chatbot-service',
      root: './services/chatbot-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/data-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'data-service',
      root: './services/data-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/document-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'document-service',
      root: './services/document-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/incentive-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'incentive-service',
      root: './services/incentive-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/knowledge-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'knowledge-service',
      root: './services/knowledge-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/planning-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'planning-service',
      root: './services/planning-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/portal-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'portal-service',
      root: './services/portal-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/reporting-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'reporting-service',
      root: './services/reporting-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/analytics-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'analytics-service',
      root: './services/analytics-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/search-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'search-service',
      root: './services/search-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/realtime-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'realtime-service',
      root: './services/realtime-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/storage-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'storage-service',
      root: './services/storage-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/graphql-gateway/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'graphql-gateway',
      root: './services/graphql-gateway',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/activities-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'activities-service',
      root: './services/activities-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/email-sync-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'email-sync-service',
      root: './services/email-sync-service',
      include: ['src/**/*.test.ts'],
    },
  },
  // services/leads-service is decommissioned (see its DEPRECATED.md) — its
  // suites are excluded from the workspace test gate rather than repaired.
  {
    extends: 'services/metadata-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'metadata-service',
      root: './services/metadata-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/notes-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'notes-service',
      root: './services/notes-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/quotes-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'quotes-service',
      root: './services/quotes-service',
      include: ['src/**/*.test.ts'],
    },
  },
  // services/deals-service is decommissioned (see its DEPRECATED.md) — its
  // suites are excluded from the workspace test gate rather than repaired.
  {
    extends: 'services/billing-service/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'billing-service',
      root: './services/billing-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'apps/web/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'web',
      root: './apps/web',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  },
  {
    extends: 'packages/service-utils/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'service-utils',
      root: './packages/service-utils',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/kafka/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'kafka',
      root: './packages/kafka',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/queue/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'queue',
      root: './packages/queue',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/outbox/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'outbox',
      root: './packages/outbox',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/security/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'security',
      root: './packages/security',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/audit/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'audit',
      root: './packages/audit',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/feature-flags/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'feature-flags',
      root: './packages/feature-flags',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/validation-gateway/vitest.config.ts',
    test: {
      // Generous limits: the whole 130+-file workspace runs in parallel on a
      // developer machine, and suites that import a full service graph can
      // spend >10s in transform under CPU contention. Not a license for
      // infra waits — infra is mocked; see the per-suite mocks.
      hookTimeout: 120_000,
      testTimeout: 60_000,
      name: 'validation-gateway',
      root: './packages/validation-gateway',
      include: ['src/**/*.test.ts'],
    },
  },
]);
