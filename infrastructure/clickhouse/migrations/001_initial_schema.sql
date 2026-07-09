-- Initial analytics schema
CREATE TABLE IF NOT EXISTS events
(
    event_id UUID,
    tenant_id LowCardinality(String),
    user_id LowCardinality(String),
    event_type LowCardinality(String),
    timestamp DateTime64(3),
    properties String CODEC(ZSTD(3))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (tenant_id, event_type, timestamp);

CREATE TABLE IF NOT EXISTS page_views
(
    view_id UUID,
    tenant_id LowCardinality(String),
    user_id LowCardinality(String),
    path String,
    referrer String,
    timestamp DateTime64(3),
    session_id UUID
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (tenant_id, path, timestamp);
