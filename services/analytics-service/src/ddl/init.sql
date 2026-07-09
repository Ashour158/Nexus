CREATE TABLE IF NOT EXISTS deal_events (
  event_id     UUID DEFAULT generateUUIDv4(),
  tenant_id    String,
  deal_id      String,
  owner_id     String,
  account_id   String,
  pipeline_id  String,
  stage_id     String,
  event_type   String,
  amount       Decimal64(2),
  currency     String,
  base_amount  Decimal64(2) DEFAULT 0,
  base_currency String DEFAULT '',
  probability  Float64 DEFAULT 0,
  forecast_category String DEFAULT '',
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS activity_events (
  event_id      UUID DEFAULT generateUUIDv4(),
  tenant_id     String,
  activity_id   String,
  owner_id      String,
  deal_id       String,
  activity_type String,
  event_type    String,
  occurred_at   DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS quote_events (
  event_id     UUID DEFAULT generateUUIDv4(),
  tenant_id    String,
  quote_id     String,
  deal_id      String,
  account_id   String,
  event_type   String,
  total        Decimal64(2),
  currency     String,
  base_amount  Decimal64(2) DEFAULT 0,
  base_currency String DEFAULT '',
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

-- CQRS Read Models (M3.2)

CREATE TABLE IF NOT EXISTS deals_summary (
  tenant_id        String,
  pipeline_id      String,
  stage_id         String,
  owner_id         String,
  territory        String,
  total_amount     Decimal64(2),
  deal_count       UInt32,
  weighted_amount  Decimal64(2),
  avg_probability  Float64,
  base_total_amount    Decimal64(2) DEFAULT 0,
  base_weighted_amount Decimal64(2) DEFAULT 0,
  base_currency        String DEFAULT '',
  updated_at       DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, pipeline_id, stage_id, owner_id, territory);

CREATE TABLE IF NOT EXISTS contacts_summary (
  tenant_id      String,
  account_id     String,
  industry       String,
  region         String,
  contact_count  UInt32,
  active_count   UInt32,
  updated_at     DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, account_id, industry, region);

CREATE TABLE IF NOT EXISTS activities_summary (
  tenant_id       String,
  owner_id        String,
  type            String,
  status          String,
  activity_count  UInt32,
  overdue_count   UInt32,
  updated_at      DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, owner_id, type, status);

CREATE TABLE IF NOT EXISTS pipeline_velocity (
  tenant_id       String,
  pipeline_id     String,
  stage_id        String,
  stage_name      String,
  avg_days_in_stage  Float64,
  conversion_rate    Float64,
  exit_count         UInt32,
  enter_count        UInt32,
  updated_at         DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, pipeline_id, stage_id);

CREATE TABLE IF NOT EXISTS invoice_events (
  event_id     UUID DEFAULT generateUUIDv4(),
  tenant_id    String,
  invoice_id   String,
  account_id   String,
  event_type   String,
  total        Decimal64(2),
  currency     String,
  base_amount  Decimal64(2) DEFAULT 0,
  base_currency String DEFAULT '',
  status       String,
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS contract_events (
  event_id     UUID DEFAULT generateUUIDv4(),
  tenant_id    String,
  contract_id  String,
  account_id   String,
  event_type   String,
  value        Decimal64(2),
  currency     String,
  status       String,
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

-- CQRS Read Models for Finance

CREATE TABLE IF NOT EXISTS invoices_summary (
  tenant_id      String,
  account_id     String,
  status         String,
  total_amount   Decimal64(2),
  invoice_count  UInt32,
  paid_amount    Decimal64(2),
  overdue_count  UInt32,
  base_total_amount Decimal64(2) DEFAULT 0,
  base_paid_amount  Decimal64(2) DEFAULT 0,
  base_currency     String DEFAULT '',
  updated_at     DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, account_id, status);

CREATE TABLE IF NOT EXISTS contracts_summary (
  tenant_id      String,
  account_id     String,
  status         String,
  total_value    Decimal64(2),
  contract_count UInt32,
  updated_at     DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, account_id, status);

CREATE TABLE IF NOT EXISTS quotes_summary (
  tenant_id      String,
  account_id     String,
  deal_id        String,
  status         String,
  total          Decimal64(2),
  quote_count    UInt32,
  base_total     Decimal64(2) DEFAULT 0,
  base_currency  String DEFAULT '',
  updated_at     DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, account_id, deal_id, status);

-- Additional raw event read-models (self-serve BI: leads/contacts/accounts/
-- orders/tickets/campaigns/subscriptions/commissions). Also created idempotently
-- at boot by ddl/ensure-read-model-tables.ts.

CREATE TABLE IF NOT EXISTS lead_events (
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
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS contact_events (
  event_id    UUID DEFAULT generateUUIDv4(),
  tenant_id   String,
  contact_id  String,
  account_id  String,
  owner_id    String,
  event_type  String,
  occurred_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS account_events (
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
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS order_events (
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
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS ticket_events (
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
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS campaign_events (
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
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS subscription_events (
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
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS commission_events (
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
PARTITION BY toYYYYMM(occurred_at);
