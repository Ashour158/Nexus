-- ClickHouse Analytics Schema for Nexus CRM

CREATE DATABASE IF NOT EXISTS nexus_analytics;

-- Events table for tracking user actions
CREATE TABLE IF NOT EXISTS nexus_analytics.events
(
    id UUID,
    tenant_id LowCardinality(String),
    user_id String,
    event_type LowCardinality(String),
    resource_type LowCardinality(String),
    resource_id String,
    properties String, -- JSON
    timestamp DateTime64(3),
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, event_type, timestamp)
TTL date + INTERVAL 2 YEAR;

-- Deals funnel metrics
CREATE TABLE IF NOT EXISTS nexus_analytics.deal_funnel
(
    tenant_id LowCardinality(String),
    stage LowCardinality(String),
    deal_count UInt32,
    total_value Decimal(18, 2),
    avg_value Decimal(18, 2),
    date Date,
    timestamp DateTime64(3)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, stage, date);

-- Revenue by period
CREATE TABLE IF NOT EXISTS nexus_analytics.revenue
(
    tenant_id LowCardinality(String),
    period LowCardinality(String), -- daily, weekly, monthly
    period_start Date,
    revenue Decimal(18, 2),
    deal_count UInt32,
    avg_deal_size Decimal(18, 2),
    timestamp DateTime64(3)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period_start)
ORDER BY (tenant_id, period, period_start);

-- User activity metrics
CREATE TABLE IF NOT EXISTS nexus_analytics.user_activity
(
    tenant_id LowCardinality(String),
    user_id String,
    date Date,
    login_count UInt32,
    actions_count UInt32,
    session_duration_seconds UInt32,
    timestamp DateTime64(3)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, user_id, date);

-- Materialized view for deal stage transitions
CREATE MATERIALIZED VIEW IF NOT EXISTS nexus_analytics.mv_deal_stage_transitions
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, from_stage, to_stage, date)
AS SELECT
    tenant_id,
    JSONExtractString(properties, 'from_stage') as from_stage,
    JSONExtractString(properties, 'to_stage') as to_stage,
    count() as transition_count,
    toDate(timestamp) as date
FROM nexus_analytics.events
WHERE event_type = 'deal.stage_changed'
GROUP BY tenant_id, from_stage, to_stage, date;
