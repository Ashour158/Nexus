import type { ClickHouseClient } from '@clickhouse/client';

/**
 * Idempotently create the ClickHouse read-model event tables the self-serve BI
 * engine queries. Additive + safe to run on every boot: every statement is
 * `CREATE TABLE IF NOT EXISTS`, so re-running is a no-op.
 *
 * These mirror the raw `deal_events` / `quote_events` pattern (one immutable row
 * per domain event) for the previously-unreportable entities: leads, contacts,
 * accounts, orders, tickets, campaigns, subscriptions, commissions. Each is
 * tenant-scoped and partitioned by month, ordered by (tenant_id, occurred_at)
 * so the compiler's tenant filter + time-range scans stay cheap.
 *
 * GUARANTEE: never throws out of `ensureReadModelTables`. A single failing
 * CREATE (e.g. ClickHouse briefly unreachable) must NOT block boot or event
 * ingestion — the consumer degrades and rows land once the table exists.
 */

const CREATE_STATEMENTS: string[] = [
  // ── Leads ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS lead_events (
    event_id    UUID DEFAULT generateUUIDv4(),
    tenant_id   String,
    lead_id     String,
    owner_id    String,
    status      String,
    source      String,
    company     String,
    event_type  String,
    occurred_at DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,

  // ── Contacts ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS contact_events (
    event_id    UUID DEFAULT generateUUIDv4(),
    tenant_id   String,
    contact_id  String,
    account_id  String,
    owner_id    String,
    event_type  String,
    occurred_at DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,

  // ── Accounts ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS account_events (
    event_id    UUID DEFAULT generateUUIDv4(),
    tenant_id   String,
    account_id  String,
    owner_id    String,
    name        String,
    industry    String,
    event_type  String,
    occurred_at DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,

  // ── Orders (quote-to-cash) ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_events (
    event_id      UUID DEFAULT generateUUIDv4(),
    tenant_id     String,
    order_id      String,
    account_id    String,
    deal_id       String,
    quote_id      String,
    event_type    String,
    status        String,
    total         Decimal64(2),
    currency      String,
    base_amount   Decimal64(2) DEFAULT 0,
    base_currency String DEFAULT '',
    occurred_at   DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,

  // ── Tickets (service) ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ticket_events (
    event_id    UUID DEFAULT generateUUIDv4(),
    tenant_id   String,
    ticket_id   String,
    number      String,
    priority    String,
    status      String,
    assignee_id String,
    account_id  String,
    event_type  String,
    occurred_at DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,

  // ── Campaigns (marketing) ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS campaign_events (
    event_id    UUID DEFAULT generateUUIDv4(),
    tenant_id   String,
    campaign_id String,
    name        String,
    type        String,
    status      String,
    owner_id    String,
    budget      Decimal64(2) DEFAULT 0,
    event_type  String,
    occurred_at DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,

  // ── Subscriptions (recurring revenue) ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS subscription_events (
    event_id      UUID DEFAULT generateUUIDv4(),
    tenant_id     String,
    subscription_id String,
    account_id    String,
    product_id    String,
    plan_name     String,
    status        String,
    mrr           Decimal64(2) DEFAULT 0,
    arr           Decimal64(2) DEFAULT 0,
    currency      String,
    base_amount   Decimal64(2) DEFAULT 0,
    base_currency String DEFAULT '',
    event_type    String,
    occurred_at   DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,

  // ── Commissions (comp) ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS commission_events (
    event_id      UUID DEFAULT generateUUIDv4(),
    tenant_id     String,
    commission_id String,
    user_id       String,
    deal_id       String,
    status        String,
    amount        Decimal64(2) DEFAULT 0,
    currency      String,
    base_amount   Decimal64(2) DEFAULT 0,
    base_currency String DEFAULT '',
    event_type    String,
    occurred_at   DateTime64(3)
  ) ENGINE = MergeTree()
  ORDER BY (tenant_id, occurred_at)
  PARTITION BY toYYYYMM(occurred_at)`,
];

async function runCommand(client: ClickHouseClient, query: string): Promise<void> {
  // @clickhouse/client exposes `command` for DDL that returns no rows.
  await (client as unknown as { command: (o: { query: string }) => Promise<unknown> }).command({
    query,
  });
}

export async function ensureReadModelTables(client: ClickHouseClient): Promise<void> {
  for (const query of CREATE_STATEMENTS) {
    try {
      await runCommand(client, query);
    } catch (err) {
      // Non-fatal: log and continue so one failing CREATE never aborts the
      // others or the boot sequence. The consumer degrades until the table lands.
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'analytics-service',
          component: 'ddl',
          message: 'ensureReadModelTables: statement failed (non-fatal)',
          error: (err as Error)?.message,
        })
      );
    }
  }
}
