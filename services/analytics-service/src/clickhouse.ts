import { createClient } from '@clickhouse/client';

export function createClickHouseClient() {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB ?? 'nexus_analytics',
    username: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
  });
}
