import type { ClickHouseClient } from '@clickhouse/client';
import { compileReportSpec, type CompiledColumn } from './query.compiler.js';

export interface QueryResult {
  columns: CompiledColumn[];
  rows: Array<Record<string, unknown>>;
}

/** Raised when ClickHouse itself fails — callers map this to HTTP 502. */
export class QueryExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryExecutionError';
  }
}

/**
 * Flexible query engine over the ClickHouse event read-model.
 * Compilation (whitelist/injection guard) throws SpecError; execution failures
 * throw QueryExecutionError. Never fabricates rows on failure.
 */
export function createQueryAnalyticsService(client: ClickHouseClient) {
  return {
    async runReport(tenantId: string, spec: unknown): Promise<QueryResult> {
      // Throws SpecError (→422) on a bad spec; do NOT catch here.
      const compiled = compileReportSpec(spec, tenantId);

      let rows: Array<Record<string, unknown>>;
      try {
        const res = await client.query({
          query: compiled.sql,
          format: 'JSONEachRow',
          query_params: compiled.params,
        });
        rows = (await res.json()) as Array<Record<string, unknown>>;
      } catch (err) {
        throw new QueryExecutionError((err as Error)?.message ?? 'ClickHouse query failed');
      }

      // Normalize numeric columns (ClickHouse returns Decimals as strings).
      const numericKeys = new Set(
        compiled.columns.filter((c) => c.type === 'number' || c.type === 'money').map((c) => c.key)
      );
      const normalized = rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const col of compiled.columns) {
          const v = row[col.key];
          out[col.key] = numericKeys.has(col.key) && v !== null && v !== undefined ? Number(v) : v;
        }
        return out;
      });

      return { columns: compiled.columns, rows: normalized };
    },
  };
}
