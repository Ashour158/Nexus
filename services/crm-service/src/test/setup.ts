import { vi } from 'vitest';

vi.mock('@nexus/cache', () => ({
  NexusCache: class {
    get = vi.fn();
    set = vi.fn();
    del = vi.fn();
    invalidatePattern = vi.fn();
    cacheAside = vi.fn(async (_key: string, factory: () => Promise<unknown>) => factory());
    connect = vi.fn();
    disconnect = vi.fn();
  },
}));

vi.mock('@nexus/kafka', () => ({
  NexusProducer: class {
    publish = vi.fn();
    connect = vi.fn();
    disconnect = vi.fn();
  },
  TOPICS: {
    LEADS: 'nexus.crm.leads',
    CONTACTS: 'nexus.crm.contacts',
    DEALS: 'nexus.crm.deals',
    ACCOUNTS: 'nexus.crm.accounts',
    ACTIVITIES: 'nexus.crm.activities',
    QUOTES: 'nexus.finance.quotes',
    INVOICES: 'nexus.finance.invoices',
    PAYMENTS: 'nexus.finance.payments',
    CONTRACTS: 'nexus.finance.contracts',
    COMMISSIONS: 'nexus.finance.commissions',
    WORKFLOWS: 'nexus.automation.workflows',
    INTEGRATION: 'nexus.integration.events',
    BLUEPRINT: 'nexus.blueprint.events',
    NOTIFICATIONS: 'nexus.platform.notifications',
    EMAILS: 'nexus.comms.emails',
    CALLS: 'nexus.comms.calls',
    ANALYTICS: 'nexus.analytics.events',
    AUDIT: 'nexus.compliance.audit',
  },
}));
