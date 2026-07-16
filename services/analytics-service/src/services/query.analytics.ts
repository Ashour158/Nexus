import type { ClickHouseClient } from '@clickhouse/client';
import { compileDrillDown, compileReportSpec, type CompiledColumn, type CompiledQuery } from './query.compiler.js';

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
  /** Execute a compiled query and normalize its rows to the declared columns. */
  const execute = async (compiled: CompiledQuery): Promise<QueryResult> => {
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
  };

  return {
    async runReport(tenantId: string, spec: unknown): Promise<QueryResult> {
      // Throws SpecError (→422) on a bad spec; do NOT catch here.
      return execute(compileReportSpec(spec, tenantId));
    },

    /**
     * The detail rows behind one aggregated point — what a user gets by clicking
     * a bar. Same whitelist and tenant scoping as runReport.
     */
    async runDrillDown(tenantId: string, spec: unknown): Promise<QueryResult> {
      return execute(compileDrillDown(spec, tenantId));
    },
  };
}
