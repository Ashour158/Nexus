import { describe, it, expect } from 'vitest';
import { compileDrillDown, compileReportSpec, SpecError } from '../query.compiler.js';

const TENANT = 'tenant-abc';

/** Every literal a caller supplies must arrive as a bound param, never inlined. */
function paramValues(params: Record<string, unknown>): unknown[] {
  return Object.entries(params)
    .filter(([k]) => k !== 'tenantId')
    .map(([, v]) => v);
}

describe('compileReportSpec', () => {
  it('scopes every query to the caller tenant', () => {
    const { sql, params } = compileReportSpec(
      { dataset: 'deals', dimensions: [{ field: 'stage_id' }], measures: [{ field: 'amount', agg: 'sum' }], filters: [] },
      TENANT
    );
    expect(sql).toContain('tenant_id = {tenantId:String}');
    expect(params.tenantId).toBe(TENANT);
  });

  it('rejects a field that is not on the dataset', () => {
    expect(() =>
      compileReportSpec({ dataset: 'deals', dimensions: [{ field: 'ssn' }], measures: [], filters: [] }, TENANT)
    ).toThrow(SpecError);
  });

  it('resolves a joined field through its alias and emits one LEFT JOIN', () => {
    const { sql } = compileReportSpec(
      {
        dataset: 'deals',
        joins: [{ dataset: 'accounts', on: 'account_id' }],
        dimensions: [{ field: 'accounts.industry' }],
        measures: [{ field: 'amount', agg: 'sum', alias: 'pipeline' }],
        filters: [],
      },
      TENANT
    );
    expect(sql).toContain('LEFT JOIN');
    // Joined attributes collapse to the entity's latest value.
    expect(sql).toContain('argMax(industry, occurred_at)');
    expect(sql).toContain('AS pipeline');
  });

  it('does not emit a join whose fields are never referenced', () => {
    const { sql } = compileReportSpec(
      {
        dataset: 'deals',
        joins: [{ dataset: 'accounts', on: 'account_id' }],
        dimensions: [{ field: 'stage_id' }],
        measures: [{ field: 'amount', agg: 'sum' }],
        filters: [],
      },
      TENANT
    );
    expect(sql).not.toContain('LEFT JOIN');
  });

  it('guards division in calculated measures against a zero denominator', () => {
    const { sql } = compileReportSpec(
      {
        dataset: 'deals',
        dimensions: [],
        measures: [
          { field: 'amount', agg: 'sum', alias: 'amt' },
          { field: 'deal_id', agg: 'count_distinct', alias: 'n' },
          { formula: 'amt / n', alias: 'avg_size' },
        ],
        filters: [],
      },
      TENANT
    );
    expect(sql).toContain('nullIf');
  });

  it('refuses a formula containing anything outside its arithmetic grammar', () => {
    expect(() =>
      compileReportSpec(
        {
          dataset: 'deals',
          dimensions: [],
          measures: [
            { field: 'amount', agg: 'sum', alias: 'amt' },
            { formula: 'amt; DROP TABLE deal_events', alias: 'x' },
          ],
          filters: [],
        },
        TENANT
      )
    ).toThrow(SpecError);
  });
});

describe('compileDrillDown', () => {
  const base = { dataset: 'deals' as const };

  it('returns detail rows — no aggregation and no GROUP BY', () => {
    const { sql } = compileDrillDown({ ...base, at: [{ field: 'stage_id', value: 'stage-1' }] }, TENANT);
    expect(sql).not.toContain('GROUP BY');
    expect(sql).not.toContain('countDistinct');
    expect(sql).toContain('FROM deal_events');
  });

  it('scopes to the caller tenant', () => {
    const { sql, params } = compileDrillDown({ ...base }, TENANT);
    expect(sql).toContain('tenant_id = {tenantId:String}');
    expect(params.tenantId).toBe(TENANT);
  });

  it('binds the clicked value as a parameter rather than inlining it', () => {
    const evil = "x' OR 1=1 --";
    const { sql, params } = compileDrillDown({ ...base, at: [{ field: 'stage_id', value: evil }] }, TENANT);
    expect(sql).not.toContain(evil);
    expect(paramValues(params)).toContain(evil);
  });

  it('rejects a drill-down point on a non-whitelisted field', () => {
    expect(() => compileDrillDown({ ...base, at: [{ field: 'password', value: 'x' }] }, TENANT)).toThrow(SpecError);
  });

  it('rejects a requested column that is not on the dataset', () => {
    expect(() => compileDrillDown({ ...base, columns: ['amount; DROP TABLE x'] }, TENANT)).toThrow(SpecError);
  });

  it('matches the chart bucket when the dimension was time-grained', () => {
    const { sql } = compileDrillDown(
      { ...base, at: [{ field: 'occurred_at', timeGrain: 'month', value: '2026-03-01T00:00:00Z' }] },
      TENANT
    );
    // Both sides truncated to the same grain, so clicking "March" yields March.
    expect(sql).toContain('toStartOfMonth(occurred_at) = toStartOfMonth(parseDateTime64BestEffort(');
  });

  it('rejects a timeGrain on a field that is not a time field', () => {
    expect(() =>
      compileDrillDown({ ...base, at: [{ field: 'stage_id', timeGrain: 'month', value: 'x' }] }, TENANT)
    ).toThrow(SpecError);
  });

  it('carries the originating report filters through', () => {
    const { sql, params } = compileDrillDown(
      { ...base, filters: [{ field: 'stage_id', op: 'eq', value: 'stage-9' }], at: [] },
      TENANT
    );
    expect(paramValues(params)).toContain('stage-9');
    expect(sql).toContain('WHERE');
  });

  it('defaults to the whole base row when no columns are requested', () => {
    const { columns } = compileDrillDown({ ...base }, TENANT);
    expect(columns.length).toBeGreaterThan(1);
    expect(columns.map((c) => c.key)).toContain('deal_id');
  });

  it('orders newest-first by default', () => {
    const { sql } = compileDrillDown({ ...base }, TENANT);
    expect(sql).toContain('ORDER BY occurred_at DESC');
  });

  it('clamps the limit so a detail query cannot pull an unbounded page', () => {
    const { sql } = compileDrillDown({ ...base, limit: 999999 }, TENANT);
    expect(sql).toContain('LIMIT 1000');
  });

  it('rejects an unknown dataset', () => {
    expect(() => compileDrillDown({ dataset: 'secrets' }, TENANT)).toThrow(SpecError);
  });

  it('resolves joined fields when the join is declared', () => {
    const { sql } = compileDrillDown(
      {
        ...base,
        joins: [{ dataset: 'accounts', on: 'account_id' }],
        columns: ['deal_id', 'accounts.industry'],
        at: [{ field: 'accounts.industry', value: 'Retail' }],
      },
      TENANT
    );
    expect(sql).toContain('LEFT JOIN');
    expect(sql).toContain('j0.j0_industry');
  });

  it('refuses a dotted field whose join was never declared', () => {
    expect(() => compileDrillDown({ ...base, columns: ['accounts.industry'] }, TENANT)).toThrow(SpecError);
  });
});
