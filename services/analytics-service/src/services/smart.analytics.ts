/**
 * Smart, deterministic analytics on top of the whitelisted query compiler.
 *
 * Everything here compiles down to the SAME parameterized, whitelist-only SQL
 * the self-serve engine uses (via compileReportSpec) — no raw identifiers, no
 * new injection surface. We only ADD math on top of the returned rows:
 *
 *   • compareToPrevious — current vs prior equal-length window + % delta
 *   • time-series       — any measure bucketed by day/week/month
 *   • insights          — top movers (MoM), anomalies (z-score), trend direction
 *
 * Fail-open contract: on any ClickHouse failure we return empty results with
 * `source: 'unavailable'` — never fabricated rows.
 */
import type { ClickHouseClient } from '@clickhouse/client';
import {
  compileReportSpec,
  getDatasetSmartMeta,
  isDataset,
  SpecError,
  type Dataset,
  type Measure,
  type TimeGrain,
  type Filter,
  type CompiledColumn,
} from './query.compiler.js';

export class SmartQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmartQueryError';
  }
}

interface ExecResult {
  columns: CompiledColumn[];
  rows: Array<Record<string, unknown>>;
}

/** Compile + execute a ReportSpec, normalizing numeric columns. Throws SpecError
 *  (bad spec) or SmartQueryError (ClickHouse failure). */
async function execSpec(
  client: ClickHouseClient,
  tenantId: string,
  spec: unknown
): Promise<ExecResult> {
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
    throw new SmartQueryError((err as Error)?.message ?? 'ClickHouse query failed');
  }
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
}

function measureKeys(columns: CompiledColumn[]): string[] {
  return columns.filter((c) => c.type === 'number' || c.type === 'money').map((c) => c.key);
}
function dimensionKeys(columns: CompiledColumn[]): string[] {
  return columns.filter((c) => c.type === 'string' || c.type === 'datetime').map((c) => c.key);
}

function pctDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

// ── compareToPrevious ────────────────────────────────────────────────────────

export interface CompareRange {
  field: string;
  from: string; // ISO
  to: string; // ISO
}

export interface CompareResult {
  columns: CompiledColumn[];
  rows: Array<Record<string, unknown>>;
  comparison: {
    range: CompareRange;
    previousRange: { from: string; to: string };
    totals: Array<{ measure: string; current: number; previous: number; delta: number; deltaPct: number | null }>;
  };
  source: 'clickhouse';
}

/** Derive the immediately-preceding equal-length window. */
function previousWindow(from: string, to: string): { from: string; to: string } {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  const len = Math.max(t - f, 0);
  return { from: new Date(f - len).toISOString(), to: from };
}

function withRangeFilters(baseSpec: Record<string, unknown>, field: string, from: string, to: string): Record<string, unknown> {
  const filters = Array.isArray(baseSpec.filters) ? [...(baseSpec.filters as Filter[])] : [];
  filters.push({ field, op: 'gte', value: from } as Filter);
  filters.push({ field, op: 'lt', value: to } as Filter);
  return { ...baseSpec, filters };
}

/**
 * Run a spec for the current window and the prior equal-length window, merge on
 * the dimension tuple, and attach per-measure `<m>__prev`, `<m>__delta`,
 * `<m>__deltaPct` plus headline totals. `range.field` must be a datetime field.
 */
export async function runReportWithComparison(
  client: ClickHouseClient,
  tenantId: string,
  spec: unknown,
  range: CompareRange
): Promise<CompareResult> {
  if (!range || typeof range.field !== 'string' || !range.from || !range.to) {
    throw new SpecError('compareToPrevious requires range { field, from, to }');
  }
  const base = (spec && typeof spec === 'object' ? { ...(spec as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const prev = previousWindow(range.from, range.to);

  const currentSpec = withRangeFilters(base, range.field, range.from, range.to);
  const previousSpec = withRangeFilters(base, range.field, prev.from, prev.to);

  const [cur, pre] = await Promise.all([
    execSpec(client, tenantId, currentSpec),
    execSpec(client, tenantId, previousSpec),
  ]);

  const mKeys = measureKeys(cur.columns);
  const dKeys = dimensionKeys(cur.columns);
  const keyOf = (row: Record<string, unknown>) => dKeys.map((k) => String(row[k] ?? '')).join('');

  const prevByKey = new Map<string, Record<string, unknown>>();
  for (const r of pre.rows) prevByKey.set(keyOf(r), r);

  const rows = cur.rows.map((row) => {
    const prevRow = prevByKey.get(keyOf(row));
    const out: Record<string, unknown> = { ...row };
    for (const m of mKeys) {
      const c = Number(row[m] ?? 0);
      const p = prevRow ? Number(prevRow[m] ?? 0) : 0;
      out[`${m}__prev`] = p;
      out[`${m}__delta`] = Number((c - p).toFixed(4));
      out[`${m}__deltaPct`] = pctDelta(c, p);
    }
    return out;
  });

  const totals = mKeys.map((m) => {
    const current = cur.rows.reduce((s, r) => s + Number(r[m] ?? 0), 0);
    const previous = pre.rows.reduce((s, r) => s + Number(r[m] ?? 0), 0);
    return {
      measure: m,
      current: Number(current.toFixed(4)),
      previous: Number(previous.toFixed(4)),
      delta: Number((current - previous).toFixed(4)),
      deltaPct: pctDelta(current, previous),
    };
  });

  return {
    columns: cur.columns,
    rows,
    comparison: { range, previousRange: prev, totals },
    source: 'clickhouse',
  };
}

// ── Time-series ──────────────────────────────────────────────────────────────

export interface TimeSeriesRequest {
  dataset: string;
  measure?: Measure;
  grain?: TimeGrain;
  filters?: Filter[];
  timeField?: string;
}

export interface TimeSeriesResult {
  dataset: string;
  grain: TimeGrain;
  timeField: string;
  measure: Measure;
  points: Array<{ bucket: string; value: number }>;
  source: 'clickhouse' | 'unavailable';
}

/** Bucket any measure over a dataset's time field. Fail-open to empty points. */
export async function getTimeSeries(
  client: ClickHouseClient,
  tenantId: string,
  req: TimeSeriesRequest
): Promise<TimeSeriesResult> {
  if (!isDataset(req.dataset)) throw new SpecError(`unknown dataset: ${JSON.stringify(req.dataset)}`);
  const meta = getDatasetSmartMeta(req.dataset as Dataset);
  const timeField = req.timeField ?? meta.timeField;
  const grain: TimeGrain = req.grain ?? 'month';
  const measure = req.measure ?? meta.defaultMeasure;
  if (!timeField) throw new SpecError(`dataset "${req.dataset}" has no time field for a time-series`);

  const bucketKey = `${timeField}_${grain}`;
  const spec = {
    dataset: req.dataset,
    measures: [measure],
    dimensions: [{ field: timeField, timeGrain: grain }],
    filters: req.filters ?? [],
    sort: [{ field: bucketKey, dir: 'asc' }],
    limit: 1000,
  };

  let result: ExecResult;
  try {
    result = await execSpec(client, tenantId, spec);
  } catch (err) {
    if (err instanceof SpecError) throw err;
    return { dataset: req.dataset, grain, timeField, measure, points: [], source: 'unavailable' };
  }

  const valueKey = measureKeys(result.columns)[0];
  const points = result.rows.map((r) => ({
    bucket: String(r[bucketKey] ?? ''),
    value: Number(r[valueKey] ?? 0),
  }));
  return { dataset: req.dataset, grain, timeField, measure, points, source: 'clickhouse' };
}

// ── Insights ─────────────────────────────────────────────────────────────────

export type InsightDirection = 'up' | 'down' | 'flat';
export type InsightSeverity = 'info' | 'notice' | 'warning';

export interface Insight {
  type: 'trend' | 'top_mover' | 'anomaly';
  title: string;
  dataset: string;
  metric: string;
  value: number;
  delta: number;
  deltaPct: number | null;
  direction: InsightDirection;
  severity: InsightSeverity;
  dimension?: string;
  dimensionValue?: string;
}

export interface InsightsResult {
  dataset: string;
  metric: string;
  grain: TimeGrain;
  insights: Insight[];
  source: 'clickhouse' | 'unavailable';
}

function directionOf(delta: number, eps = 1e-9): InsightDirection {
  if (delta > eps) return 'up';
  if (delta < -eps) return 'down';
  return 'flat';
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function stddev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

export interface InsightsOptions {
  measure?: Measure;
  grain?: TimeGrain;
  /** stddev multiplier for anomaly flagging (default 2). */
  sigma?: number;
  /** max top-movers to return (default 5). */
  topN?: number;
  filters?: Filter[];
}

/**
 * Deterministic insight sweep over a dataset's read-model:
 *  1. trend — direction + magnitude of the default measure over the series
 *  2. anomaly — latest bucket beyond ±sigma·stddev of the trailing mean
 *  3. top movers — biggest MoM deltas across the primary breakdown dimension
 *
 * Fail-open: any ClickHouse failure yields `insights: []`, `source: 'unavailable'`.
 */
export async function getInsights(
  client: ClickHouseClient,
  tenantId: string,
  dataset: string,
  opts: InsightsOptions = {}
): Promise<InsightsResult> {
  if (!isDataset(dataset)) throw new SpecError(`unknown dataset: ${JSON.stringify(dataset)}`);
  const meta = getDatasetSmartMeta(dataset as Dataset);
  const grain: TimeGrain = opts.grain ?? 'month';
  const measure = opts.measure ?? meta.defaultMeasure;
  const sigma = opts.sigma ?? 2;
  if (!Number.isFinite(sigma) || sigma <= 0) {
    throw new SpecError(`sigma must be a finite number > 0, got ${JSON.stringify(opts.sigma)}`);
  }
  const topN = opts.topN ?? 5;
  if (!Number.isInteger(topN) || topN <= 0) {
    throw new SpecError(`topN must be an integer > 0, got ${JSON.stringify(opts.topN)}`);
  }
  const metricLabel = measure.agg === 'count' ? 'count' : `${measure.agg}(${measure.field})`;

  if (!meta.timeField) {
    return { dataset, metric: metricLabel, grain, insights: [], source: 'unavailable' };
  }

  const insights: Insight[] = [];
  let anyData = false;

  // 1 + 2 — overall time-series → trend + anomaly.
  try {
    const ts = await getTimeSeries(client, tenantId, {
      dataset,
      measure,
      grain,
      timeField: meta.timeField,
      filters: opts.filters,
    });
    if (ts.source === 'clickhouse') {
      anyData = true;
      const pts = ts.points;
      if (pts.length >= 2) {
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const delta = last.value - prev.value;
        insights.push({
          type: 'trend',
          title: `${dataset} ${metricLabel} ${directionOf(delta) === 'up' ? 'rose' : directionOf(delta) === 'down' ? 'fell' : 'held flat'} vs prior ${grain}`,
          dataset,
          metric: metricLabel,
          value: last.value,
          delta: Number(delta.toFixed(4)),
          deltaPct: pctDelta(last.value, prev.value),
          direction: directionOf(delta),
          severity: 'info',
        });

        // anomaly on the latest point vs trailing mean (exclude last).
        const trailing = pts.slice(0, -1).map((p) => p.value);
        const mu = mean(trailing);
        const sd = stddev(trailing, mu);
        if (sd > 0) {
          const z = (last.value - mu) / sd;
          if (Math.abs(z) >= sigma) {
            insights.push({
              type: 'anomaly',
              title: `${dataset} ${metricLabel} is an outlier this ${grain} (${z >= 0 ? '+' : ''}${z.toFixed(1)}σ)`,
              dataset,
              metric: metricLabel,
              value: last.value,
              delta: Number((last.value - mu).toFixed(4)),
              deltaPct: pctDelta(last.value, mu),
              direction: directionOf(last.value - mu),
              severity: Math.abs(z) >= sigma + 1 ? 'warning' : 'notice',
            });
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof SpecError) throw err;
  }

  // 3 — top movers across the primary breakdown dimension (last two buckets).
  const breakdown = meta.breakdownDimensions.find((d) => d !== 'event_type') ?? meta.breakdownDimensions[0];
  if (breakdown) {
    const bucketKey = `${meta.timeField}_${grain}`;
    const spec = {
      dataset,
      measures: [measure],
      dimensions: [{ field: breakdown }, { field: meta.timeField, timeGrain: grain }],
      filters: opts.filters ?? [],
      sort: [{ field: bucketKey, dir: 'asc' }],
      limit: 5000,
    };
    try {
      const res = await execSpec(client, tenantId, spec);
      anyData = true;
      const valueKey = measureKeys(res.columns)[0];
      // buckets sorted asc; take the two most recent distinct buckets.
      const buckets = Array.from(new Set(res.rows.map((r) => String(r[bucketKey] ?? '')))).sort();
      const lastB = buckets[buckets.length - 1];
      const prevB = buckets[buckets.length - 2];
      if (lastB && prevB) {
        const cur = new Map<string, number>();
        const pre = new Map<string, number>();
        for (const r of res.rows) {
          const b = String(r[bucketKey] ?? '');
          const dim = String(r[breakdown] ?? '');
          const v = Number(r[valueKey] ?? 0);
          if (b === lastB) cur.set(dim, v);
          else if (b === prevB) pre.set(dim, v);
        }
        const dims = new Set<string>([...cur.keys(), ...pre.keys()]);
        const movers = Array.from(dims)
          .map((dim) => {
            const c = cur.get(dim) ?? 0;
            const p = pre.get(dim) ?? 0;
            return { dim, current: c, delta: c - p, deltaPct: pctDelta(c, p) };
          })
          .filter((m) => m.delta !== 0)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, topN);
        for (const m of movers) {
          insights.push({
            type: 'top_mover',
            title: `${breakdown} "${m.dim || '(none)'}" ${directionOf(m.delta) === 'up' ? 'up' : 'down'} ${Math.abs(m.delta).toFixed(0)} in ${metricLabel}`,
            dataset,
            metric: metricLabel,
            value: m.current,
            delta: Number(m.delta.toFixed(4)),
            deltaPct: m.deltaPct,
            direction: directionOf(m.delta),
            severity: 'info',
            dimension: breakdown,
            dimensionValue: m.dim,
          });
        }
      }
    } catch (err) {
      if (err instanceof SpecError) throw err;
    }
  }

  return {
    dataset,
    metric: metricLabel,
    grain,
    insights,
    source: anyData ? 'clickhouse' : 'unavailable',
  };
}
