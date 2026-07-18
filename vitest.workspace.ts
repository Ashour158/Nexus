import { defineWorkspace } from 'vitest/config';

/**
 * Workspace roots use `services/*` (this monorepo layout). Prompt 10 referenced
 * `apps/*-service`; those paths do not exist here.
 */
export default defineWorkspace([
  {
    extends: 'services/auth-service/vitest.config.ts',
    test: {
      name: 'auth-service',
      root: './services/auth-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/crm-service/vitest.config.ts',
    test: {
      name: 'crm-service',
      root: './services/crm-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/finance-service/vitest.config.ts',
    test: {
      name: 'finance-service',
      root: './services/finance-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/comm-service/vitest.config.ts',
    test: {
      name: 'comm-service',
      root: './services/comm-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/notification-service/vitest.config.ts',
    test: {
      name: 'notification-service',
      root: './services/notification-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/workflow-service/vitest.config.ts',
    test: {
      name: 'workflow-service',
      root: './services/workflow-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/integration-service/vitest.config.ts',
    test: {
      name: 'integration-service',
      root: './services/integration-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/blueprint-service/vitest.config.ts',
    test: {
      name: 'blueprint-service',
      root: './services/blueprint-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/approval-service/vitest.config.ts',
    test: {
      name: 'approval-service',
      root: './services/approval-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/cadence-service/vitest.config.ts',
    test: {
      name: 'cadence-service',
      root: './services/cadence-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/territory-service/vitest.config.ts',
    test: {
      name: 'territory-service',
      root: './services/territory-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/chatbot-service/vitest.config.ts',
    test: {
      name: 'chatbot-service',
      root: './services/chatbot-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/data-service/vitest.config.ts',
    test: {
      name: 'data-service',
      root: './services/data-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/document-service/vitest.config.ts',
    test: {
      name: 'document-service',
      root: './services/document-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/incentive-service/vitest.config.ts',
    test: {
      name: 'incentive-service',
      root: './services/incentive-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/knowledge-service/vitest.config.ts',
    test: {
      name: 'knowledge-service',
      root: './services/knowledge-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/planning-service/vitest.config.ts',
    test: {
      name: 'planning-service',
      root: './services/planning-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/portal-service/vitest.config.ts',
    test: {
      name: 'portal-service',
      root: './services/portal-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/reporting-service/vitest.config.ts',
    test: {
      name: 'reporting-service',
      root: './services/reporting-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/analytics-service/vitest.config.ts',
    test: {
      name: 'analytics-service',
      root: './services/analytics-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/search-service/vitest.config.ts',
    test: {
      name: 'search-service',
      root: './services/search-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/realtime-service/vitest.config.ts',
    test: {
      name: 'realtime-service',
      root: './services/realtime-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/storage-service/vitest.config.ts',
    test: {
      name: 'storage-service',
      root: './services/storage-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/graphql-gateway/vitest.config.ts',
    test: {
      name: 'graphql-gateway',
      root: './services/graphql-gateway',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/router-coprocessor/vitest.config.ts',
    test: {
      name: 'router-coprocessor',
      root: './services/router-coprocessor',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/accounts-service/vitest.config.ts',
    test: {
      name: 'accounts-service',
      root: './services/accounts-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/activities-service/vitest.config.ts',
    test: {
      name: 'activities-service',
      root: './services/activities-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/email-sync-service/vitest.config.ts',
    test: {
      name: 'email-sync-service',
      root: './services/email-sync-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/leads-service/vitest.config.ts',
    test: {
      name: 'leads-service',
      root: './services/leads-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/metadata-service/vitest.config.ts',
    test: {
      name: 'metadata-service',
      root: './services/metadata-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/notes-service/vitest.config.ts',
    test: {
      name: 'notes-service',
      root: './services/notes-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/quotes-service/vitest.config.ts',
    test: {
      name: 'quotes-service',
      root: './services/quotes-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/deals-service/vitest.config.ts',
    test: {
      name: 'deals-service',
      root: './services/deals-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/contacts-service/vitest.config.ts',
    test: {
      name: 'contacts-service',
      root: './services/contacts-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'services/billing-service/vitest.config.ts',
    test: {
      name: 'billing-service',
      root: './services/billing-service',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/service-utils/vitest.config.ts',
    test: {
      name: 'service-utils',
      root: './packages/service-utils',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/kafka/vitest.config.ts',
    test: {
      name: 'kafka',
      root: './packages/kafka',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/queue/vitest.config.ts',
    test: {
      name: 'queue',
      root: './packages/queue',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/outbox/vitest.config.ts',
    test: {
      name: 'outbox',
      root: './packages/outbox',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/security/vitest.config.ts',
    test: {
      name: 'security',
      root: './packages/security',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/audit/vitest.config.ts',
    test: {
      name: 'audit',
      root: './packages/audit',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/feature-flags/vitest.config.ts',
    test: {
      name: 'feature-flags',
      root: './packages/feature-flags',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'packages/validation-gateway/vitest.config.ts',
    test: {
      name: 'validation-gateway',
      root: './packages/validation-gateway',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    extends: 'tools/event-contract/vitest.config.ts',
    test: {
      name: 'event-contract',
      root: './tools/event-contract',
      include: ['*.test.ts'],
    },
  },
]);
