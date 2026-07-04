/**
 * Flexible query execution engine — safe ReportSpec → ClickHouse SQL compiler.
 *
 * Powers self-serve BI: a whitelisted ReportSpec (produced by reporting-service)
 * is compiled to a fully parameterized ClickHouse query and executed against the
 * existing event read-model. NO user-supplied identifier ever reaches the SQL
 * string: every field is resolved through a per-dataset WHITELIST, and every
 * value is bound via ClickHouse query_params. Anything off the whitelist is
 * rejected (SpecError → 422).
 *
 * Base-currency: money measures use `if(base_amount != 0, base_amount, amount)`
 * to stay consistent with the existing roll-ups in revenue/pipeline analytics.
 */

// ── Contract (accepted EXACTLY; mirrors reporting-service) ──────────────────

export type Dataset = 'deals' | 'leads' | 'activities' | 'revenue' | 'quotes';
export type Agg = 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max';
export type TimeGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';

export interface Measure {
  field: string;
  agg: Agg;
  alias?: string;
}
export interface Dimension {
  field: string;
  timeGrain?: TimeGrain;
}
export interface Filter {
  field: string;
  op: FilterOp;
  value: unknown;
}
export interface Sort {
  field: string;
  dir: 'asc' | 'desc';
}
export interface ReportSpec {
  dataset: Dataset;
  measures: Measure[];
  dimensions: Dimension[];
  filters: Filter[];
  sort?: Sort[];
  limit?: number;
}

/** Thrown on any invalid / non-whitelisted spec. Mapped to HTTP 422 by callers. */
export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecError';
  }
}

// ── Field catalogue ─────────────────────────────────────────────────────────

type FieldType = 'string' | 'number' | 'money' | 'datetime';

interface FieldDef {
  /** Physical ClickHouse expression. For `money` this is resolved specially. */
  expr: string;
  label: string;
  type: FieldType;
  /** Allowed as a measure (aggregatable). */
  measurable?: boolean;
  /** Allowed as a dimension (group-by). */
  dimensionable?: boolean;
  /** Allowed in filters. */
  filterable?: boolean;
  /** Time dimension — enables timeGrain bucketing. */
  time?: boolean;
}

interface DatasetDef {
  table: string;
  /** Optional fixed predicate applied in addition to tenant scope (e.g. event-type gating). */
  baseWhere?: string;
  fields: Record<string, FieldDef>;
}

/**
 * The money base-currency expression, reused wherever an amount is aggregated.
 * `amountCol`/`baseCol` name the physical columns on the dataset's table.
 */
function money(amountCol: string, baseCol: string): string {
  return `if(${baseCol} != 0, ${baseCol}, ${amountCol})`;
}

const DEAL_MONEY = money('amount', 'base_amount');
const QUOTE_MONEY = money('total', 'base_amount');

const CATALOG: Record<Dataset, DatasetDef> = {
  deals: {
    table: 'deal_events',
    fields: {
      deal_id: { expr: 'deal_id', label: 'Deal', type: 'string', measurable: true, dimensionable: true, filterable: true },
      owner_id: { expr: 'owner_id', label: 'Owner', type: 'string', dimensionable: true, filterable: true },
      account_id: { expr: 'account_id', label: 'Account', type: 'string', dimensionable: true, filterable: true },
      pipeline_id: { expr: 'pipeline_id', label: 'Pipeline', type: 'string', dimensionable: true, filterable: true },
      stage_id: { expr: 'stage_id', label: 'Stage', type: 'string', dimensionable: true, filterable: true },
      event_type: { expr: 'event_type', label: 'Event Type', type: 'string', dimensionable: true, filterable: true },
      currency: { expr: 'currency', label: 'Currency', type: 'string', dimensionable: true, filterable: true },
      amount: { expr: DEAL_MONEY, label: 'Amount', type: 'money', measurable: true, filterable: true },
      probability: { expr: 'probability', label: 'Probability', type: 'number', measurable: true, filterable: true },
      occurred_at: { expr: 'occurred_at', label: 'Occurred At', type: 'datetime', dimensionable: true, filterable: true, time: true },
    },
  },
  // No dedicated lead read-model exists; `deal.created` events are the closest
  // real signal (deal/lead intake). Scoped to that event type so counts are honest.
  leads: {
    table: 'deal_events',
    baseWhere: `event_type = 'deal.created'`,
    fields: {
      deal_id: { expr: 'deal_id', label: 'Lead', type: 'string', measurable: true, dimensionable: true, filterable: true },
      owner_id: { expr: 'owner_id', label: 'Owner', type: 'string', dimensionable: true, filterable: true },
      account_id: { expr: 'account_id', label: 'Account', type: 'string', dimensionable: true, filterable: true },
      pipeline_id: { expr: 'pipeline_id', label: 'Pipeline', type: 'string', dimensionable: true, filterable: true },
      stage_id: { expr: 'stage_id', label: 'Stage', type: 'string', dimensionable: true, filterable: true },
      currency: { expr: 'currency', label: 'Currency', type: 'string', dimensionable: true, filterable: true },
      amount: { expr: DEAL_MONEY, label: 'Amount', type: 'money', measurable: true, filterable: true },
      occurred_at: { expr: 'occurred_at', label: 'Created At', type: 'datetime', dimensionable: true, filterable: true, time: true },
    },
  },
  activities: {
    table: 'activity_events',
    fields: {
      activity_id: { expr: 'activity_id', label: 'Activity', type: 'string', measurable: true, dimensionable: true, filterable: true },
      owner_id: { expr: 'owner_id', label: 'Owner', type: 'string', dimensionable: true, filterable: true },
      deal_id: { expr: 'deal_id', label: 'Deal', type: 'string', dimensionable: true, filterable: true },
      activity_type: { expr: 'activity_type', label: 'Activity Type', type: 'string', dimensionable: true, filterable: true },
      event_type: { expr: 'event_type', label: 'Event Type', type: 'string', dimensionable: true, filterable: true },
      occurred_at: { expr: 'occurred_at', label: 'Occurred At', type: 'datetime', dimensionable: true, filterable: true, time: true },
    },
  },
  // Revenue is derived from won/lost deal events — same source as revenue.analytics.ts.
  revenue: {
    table: 'deal_events',
    baseWhere: `event_type IN ('deal.won', 'deal.lost')`,
    fields: {
      deal_id: { expr: 'deal_id', label: 'Deal', type: 'string', measurable: true, dimensionable: true, filterable: true },
      owner_id: { expr: 'owner_id', label: 'Owner', type: 'string', dimensionable: true, filterable: true },
      account_id: { expr: 'account_id', label: 'Account', type: 'string', dimensionable: true, filterable: true },
      event_type: { expr: 'event_type', label: 'Outcome', type: 'string', dimensionable: true, filterable: true },
      currency: { expr: 'currency', label: 'Currency', type: 'string', dimensionable: true, filterable: true },
      amount: { expr: DEAL_MONEY, label: 'Revenue', type: 'money', measurable: true, filterable: true },
      occurred_at: { expr: 'occurred_at', label: 'Closed At', type: 'datetime', dimensionable: true, filterable: true, time: true },
    },
  },
  quotes: {
    table: 'quote_events',
    fields: {
      quote_id: { expr: 'quote_id', label: 'Quote', type: 'string', measurable: true, dimensionable: true, filterable: true },
      deal_id: { expr: 'deal_id', label: 'Deal', type: 'string', dimensionable: true, filterable: true },
      account_id: { expr: 'account_id', label: 'Account', type: 'string', dimensionable: true, filterable: true },
      event_type: { expr: 'event_type', label: 'Event Type', type: 'string', dimensionable: true, filterable: true },
      currency: { expr: 'currency', label: 'Currency', type: 'string', dimensionable: true, filterable: true },
      total: { expr: QUOTE_MONEY, label: 'Total', type: 'money', measurable: true, filterable: true },
      occurred_at: { expr: 'occurred_at', label: 'Occurred At', type: 'datetime', dimensionable: true, filterable: true, time: true },
    },
  },
};

const AGGS: readonly Agg[] = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'];
const TIME_GRAINS: readonly TimeGrain[] = ['day', 'week', 'month', 'quarter', 'year'];
const FILTER_OPS: readonly FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'];
const SQL_OP: Record<Exclude<FilterOp, 'in' | 'contains'>, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const TIME_GRAIN_FN: Record<TimeGrain, string> = {
  day: 'toStartOfDay',
  week: 'toStartOfWeek',
  month: 'toStartOfMonth',
  quarter: 'toStartOfQuarter',
  year: 'toStartOfYear',
};

const MAX_LIMIT = 10000;
const DEFAULT_LIMIT = 1000;

// ── Field metadata (for the /fields endpoint) ───────────────────────────────

export interface FieldMeta {
  key: string;
  label: string;
  type: FieldType;
}
export interface DatasetFields {
  dataset: Dataset;
  table: string;
  measures: FieldMeta[];
  dimensions: FieldMeta[];
  filters: FieldMeta[];
}

export function isDataset(v: unknown): v is Dataset {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, v);
}

export function describeDataset(dataset: Dataset): DatasetFields {
  const def = CATALOG[dataset];
  const measures: FieldMeta[] = [];
  const dimensions: FieldMeta[] = [];
  const filters: FieldMeta[] = [];
  for (const [key, f] of Object.entries(def.fields)) {
    if (f.measurable) measures.push({ key, label: f.label, type: f.type });
    if (f.dimensionable) dimensions.push({ key, label: f.label, type: f.type });
    if (f.filterable) filters.push({ key, label: f.label, type: f.type });
  }
  return { dataset, table: def.table, measures, dimensions, filters };
}

// ── Compilation ─────────────────────────────────────────────────────────────

export interface CompiledColumn {
  key: string;
  label: string;
  type: FieldType;
}
export interface CompiledQuery {
  sql: string;
  params: Record<string, unknown>;
  columns: CompiledColumn[];
}

/** ClickHouse identifiers we emit are all whitelisted, but validate output aliases too. */
const SAFE_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertArray(v: unknown, name: string): unknown[] {
  if (!Array.isArray(v)) throw new SpecError(`\`${name}\` must be an array`);
  return v;
}

/**
 * Compile a ReportSpec into a parameterized ClickHouse query.
 * Throws SpecError on any structural or whitelist violation.
 */
export function compileReportSpec(spec: unknown, tenantId: string): CompiledQuery {
  if (!spec || typeof spec !== 'object') throw new SpecError('spec must be an object');
  const s = spec as Record<string, unknown>;

  if (!isDataset(s.dataset)) {
    throw new SpecError(`unknown dataset: ${JSON.stringify(s.dataset)}`);
  }
  const def = CATALOG[s.dataset];

  const measuresIn = assertArray(s.measures ?? [], 'measures') as Measure[];
  const dimensionsIn = assertArray(s.dimensions ?? [], 'dimensions') as Dimension[];
  const filtersIn = assertArray(s.filters ?? [], 'filters') as Filter[];
  const sortIn = (s.sort === undefined ? [] : assertArray(s.sort, 'sort')) as Sort[];

  if (measuresIn.length === 0 && dimensionsIn.length === 0) {
    throw new SpecError('spec must include at least one measure or dimension');
  }

  const params: Record<string, unknown> = { tenantId };
  let paramSeq = 0;
  const bind = (value: unknown): string => {
    const name = `p${paramSeq++}`;
    params[name] = value;
    return name;
  };

  const selectParts: string[] = [];
  const groupByParts: string[] = [];
  const columns: CompiledColumn[] = [];
  // Map an output key back to its emitted SQL alias so ORDER BY can reference it.
  const outputAlias = new Map<string, string>();

  const resolveField = (field: unknown, role: string): { key: string; def: FieldDef } => {
    if (typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(def.fields, field)) {
      throw new SpecError(`field "${String(field)}" is not allowed as a ${role} on dataset "${s.dataset}"`);
    }
    return { key: field, def: def.fields[field] };
  };

  // Dimensions (with optional time bucketing) → SELECT + GROUP BY
  for (const dim of dimensionsIn) {
    if (!dim || typeof dim !== 'object') throw new SpecError('each dimension must be an object');
    const { key, def: fd } = resolveField(dim.field, 'dimension');
    if (!fd.dimensionable) throw new SpecError(`field "${key}" cannot be used as a dimension`);

    let expr = fd.expr;
    let outKey = key;
    let outType: FieldType = fd.type;
    if (dim.timeGrain !== undefined) {
      if (!fd.time) throw new SpecError(`field "${key}" does not support timeGrain`);
      if (!TIME_GRAINS.includes(dim.timeGrain)) {
        throw new SpecError(`invalid timeGrain: ${JSON.stringify(dim.timeGrain)}`);
      }
      expr = `${TIME_GRAIN_FN[dim.timeGrain]}(${fd.expr})`;
      outKey = `${key}_${dim.timeGrain}`;
      outType = 'datetime';
    }
    if (!SAFE_ALIAS.test(outKey)) throw new SpecError(`invalid dimension alias: ${outKey}`);
    selectParts.push(`${expr} AS ${outKey}`);
    groupByParts.push(outKey);
    columns.push({ key: outKey, label: fd.label, type: outType });
    outputAlias.set(outKey, outKey);
  }

  // Measures → aggregated SELECT
  const usedAliases = new Set<string>(groupByParts);
  for (const m of measuresIn) {
    if (!m || typeof m !== 'object') throw new SpecError('each measure must be an object');
    if (!AGGS.includes(m.agg)) throw new SpecError(`invalid agg: ${JSON.stringify(m.agg)}`);

    let inner: string;
    let outType: FieldType;
    let defaultKey: string;
    if (m.agg === 'count') {
      // count() ignores the field; allow "*" or any whitelisted field.
      if (m.field && m.field !== '*') resolveField(m.field, 'measure');
      inner = 'count()';
      outType = 'number';
      defaultKey = 'count';
    } else {
      const { key, def: fd } = resolveField(m.field, 'measure');
      if (!fd.measurable) throw new SpecError(`field "${key}" cannot be used as a measure`);
      if ((m.agg === 'sum' || m.agg === 'avg') && fd.type === 'string') {
        throw new SpecError(`agg "${m.agg}" is not valid for string field "${key}"`);
      }
      const fn = m.agg === 'count_distinct' ? 'countDistinct' : m.agg;
      inner = `${fn}(${fd.expr})`;
      outType = m.agg === 'count_distinct' ? 'number' : fd.type === 'money' ? 'money' : 'number';
      defaultKey = `${m.agg}_${key}`;
    }

    let alias = m.alias ?? defaultKey;
    if (!SAFE_ALIAS.test(alias)) throw new SpecError(`invalid measure alias: ${alias}`);
    // De-duplicate colliding aliases deterministically.
    if (usedAliases.has(alias)) {
      let n = 2;
      while (usedAliases.has(`${alias}_${n}`)) n++;
      alias = `${alias}_${n}`;
    }
    usedAliases.add(alias);
    selectParts.push(`${inner} AS ${alias}`);
    columns.push({ key: alias, label: prettyLabel(m.alias ?? defaultKey), type: outType });
    outputAlias.set(alias, alias);
  }

  // WHERE — tenant scope + fixed base predicate + user filters (all parameterized)
  const whereParts: string[] = [`tenant_id = {tenantId:String}`];
  if (def.baseWhere) whereParts.push(def.baseWhere);

  for (const f of filtersIn) {
    if (!f || typeof f !== 'object') throw new SpecError('each filter must be an object');
    if (!FILTER_OPS.includes(f.op)) throw new SpecError(`invalid filter op: ${JSON.stringify(f.op)}`);
    const { key, def: fd } = resolveField(f.field, 'filter');
    if (!fd.filterable) throw new SpecError(`field "${key}" cannot be used in a filter`);
    whereParts.push(compileFilter(fd, f, bind));
  }

  // ORDER BY — only over emitted output columns.
  const orderParts: string[] = [];
  for (const srt of sortIn) {
    if (!srt || typeof srt !== 'object') throw new SpecError('each sort must be an object');
    const aliasKey = outputAlias.get(srt.field as string);
    if (!aliasKey) {
      throw new SpecError(`sort field "${String(srt.field)}" is not a selected measure or dimension`);
    }
    const dir = srt.dir === 'desc' ? 'DESC' : srt.dir === 'asc' ? 'ASC' : undefined;
    if (!dir) throw new SpecError(`invalid sort dir: ${JSON.stringify(srt.dir)}`);
    orderParts.push(`${aliasKey} ${dir}`);
  }

  // LIMIT — clamped, bound as a param.
  let limit = DEFAULT_LIMIT;
  if (s.limit !== undefined) {
    const n = Number(s.limit);
    if (!Number.isFinite(n) || n <= 0) throw new SpecError(`invalid limit: ${JSON.stringify(s.limit)}`);
    limit = Math.min(Math.floor(n), MAX_LIMIT);
  }

  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM ${def.table}`,
    `WHERE ${whereParts.join(' AND ')}`,
    groupByParts.length ? `GROUP BY ${groupByParts.join(', ')}` : '',
    orderParts.length ? `ORDER BY ${orderParts.join(', ')}` : '',
    `LIMIT ${limit}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { sql, params, columns };
}

function compileFilter(
  fd: FieldDef,
  f: Filter,
  bind: (value: unknown) => string
): string {
  const chType = clickhouseParamType(fd.type);

  if (f.op === 'in') {
    if (fd.type === 'datetime') throw new SpecError(`filter op "in" is not supported for datetime fields`);
    if (!Array.isArray(f.value)) throw new SpecError(`filter op "in" requires an array value`);
    if (f.value.length === 0) throw new SpecError(`filter op "in" requires a non-empty array`);
    const coerced = f.value.map((v) => coerceScalar(fd.type, v));
    const name = bind(coerced);
    return `${fd.expr} IN ({${name}:Array(${chType})})`;
  }

  if (f.op === 'contains') {
    if (fd.type !== 'string') throw new SpecError(`filter op "contains" requires a string field`);
    const name = bind(String(f.value ?? ''));
    return `positionCaseInsensitive(${fd.expr}, {${name}:String}) > 0`;
  }

  // Datetime columns are DateTime64 — bind the value as a String and parse it in
  // SQL, matching the existing analytics (parseDateTime64BestEffort).
  if (fd.type === 'datetime') {
    const name = bind(String(f.value ?? ''));
    return `${fd.expr} ${SQL_OP[f.op]} parseDateTime64BestEffort({${name}:String})`;
  }

  const name = bind(coerceScalar(fd.type, f.value));
  return `${fd.expr} ${SQL_OP[f.op]} {${name}:${chType}}`;
}

function clickhouseParamType(t: FieldType): string {
  switch (t) {
    case 'number':
    case 'money':
      return 'Float64';
    case 'datetime':
      return 'String'; // parsed via parseDateTime64BestEffort? no — compared as bound string against DateTime column
    case 'string':
    default:
      return 'String';
  }
}

function coerceScalar(t: FieldType, v: unknown): unknown {
  if (t === 'number' || t === 'money') {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new SpecError(`expected a numeric filter value, got ${JSON.stringify(v)}`);
    return n;
  }
  return v === null || v === undefined ? '' : String(v);
}

function prettyLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
