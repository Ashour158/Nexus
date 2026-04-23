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
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);
