/**
 * Shared ReportSpec contract + validator for the self-serve BI system.
 *
 * This service stores ReportSpec DEFINITIONS; analytics-service executes them
 * (it consumes the EXACT same shape). Keep this contract in sync with
 * analytics-service's query endpoint.
 */

export type Dataset =
  | 'deals'
  | 'leads'
  | 'activities'
  | 'revenue'
  | 'quotes'
  | 'contacts'
  | 'accounts'
  | 'orders'
  | 'invoices'
  | 'tickets'
  | 'campaigns'
  | 'subscriptions'
  | 'commissions';
export type Aggregation = 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max';
export type TimeGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
export type SortDir = 'asc' | 'desc';
export type ChartType =
  | 'bar'
  | 'stacked_bar'
  | 'hbar'
  | 'line'
  | 'area'
  | 'combo'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'radar'
  | 'treemap'
  | 'radial'
  | 'funnel'
  | 'table'
  | 'kpi';

export interface Measure {
  /** Physical field for a base aggregate. Omitted on a calculated measure. */
  field?: string;
  /** Aggregation for a base measure. Omitted on a calculated measure. */
  agg?: Aggregation;
  /**
   * Calculated measure — a safe arithmetic formula over the aliases of measures
   * defined earlier in the spec (e.g. "won / total"). Compiled by
   * analytics-service; div-by-zero guarded.
   */
  formula?: string;
  alias?: string;
}

export interface Dimension {
  field: string;
  timeGrain?: TimeGrain;
}

export interface FilterClause {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface SortClause {
  field: string;
  dir: SortDir;
}

export interface ReportSpec {
  dataset: Dataset;
  measures: Measure[];
  dimensions: Dimension[];
  filters: FilterClause[];
  sort?: SortClause[];
  limit?: number;
}

const DATASETS: readonly Dataset[] = [
  'deals',
  'leads',
  'activities',
  'revenue',
  'quotes',
  'contacts',
  'accounts',
  'orders',
  'invoices',
  'tickets',
  'campaigns',
  'subscriptions',
  'commissions',
];
const AGGS: readonly Aggregation[] = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'];
const TIME_GRAINS: readonly TimeGrain[] = ['day', 'week', 'month', 'quarter', 'year'];
const FILTER_OPS: readonly FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'];
const SORT_DIRS: readonly SortDir[] = ['asc', 'desc'];
export const CHART_TYPES: readonly ChartType[] = [
  'bar', 'stacked_bar', 'hbar', 'line', 'area', 'combo', 'pie', 'donut',
  'scatter', 'radar', 'treemap', 'radial', 'funnel', 'table', 'kpi',
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  /** Normalised, safe-to-store spec (only present when valid). */
  spec?: ReportSpec;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const MAX_LIMIT = 10_000;

/**
 * Validate an arbitrary payload as a ReportSpec.
 *
 * Rules:
 *  - `dataset` must be one of the known datasets.
 *  - Either at least one measure, OR a raw table (no measures AND no
 *    dimensions is allowed — treated as a raw table dump of the dataset).
 *  - Every measure/dimension/filter/sort clause is well-formed.
 *  - `limit`, when present, is a positive integer within bounds.
 */
export function validateReportSpec(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { valid: false, errors: ['spec must be an object'] };
  }

  const dataset = input.dataset;
  if (typeof dataset !== 'string' || !DATASETS.includes(dataset as Dataset)) {
    errors.push(`dataset must be one of: ${DATASETS.join(', ')}`);
  }

  const measuresRaw = input.measures ?? [];
  const dimensionsRaw = input.dimensions ?? [];
  const filtersRaw = input.filters ?? [];
  const sortRaw = input.sort;

  if (!Array.isArray(measuresRaw)) errors.push('measures must be an array');
  if (!Array.isArray(dimensionsRaw)) errors.push('dimensions must be an array');
  if (!Array.isArray(filtersRaw)) errors.push('filters must be an array');
  if (sortRaw !== undefined && !Array.isArray(sortRaw)) errors.push('sort must be an array');

  const measures: Measure[] = [];
  if (Array.isArray(measuresRaw)) {
    measuresRaw.forEach((m, i) => {
      if (!isPlainObject(m)) {
        errors.push(`measures[${i}] must be an object`);
        return;
      }
      if (m.alias !== undefined && typeof m.alias !== 'string') {
        errors.push(`measures[${i}].alias must be a string`);
      }
      // Calculated measure: a formula string, no field/agg. Deep validation of
      // the expression (whitelisted tokens, alias resolution) happens in
      // analytics-service's compiler; here we just carry it through.
      if (typeof m.formula === 'string') {
        if (m.formula.trim().length === 0) {
          errors.push(`measures[${i}].formula must be a non-empty string`);
        } else {
          measures.push({
            formula: m.formula,
            ...(typeof m.alias === 'string' ? { alias: m.alias } : {}),
          });
        }
        return;
      }
      if (typeof m.field !== 'string' || m.field.length === 0) {
        errors.push(`measures[${i}].field is required`);
      }
      if (typeof m.agg !== 'string' || !AGGS.includes(m.agg as Aggregation)) {
        errors.push(`measures[${i}].agg must be one of: ${AGGS.join(', ')}`);
      }
      if (typeof m.field === 'string' && typeof m.agg === 'string' && AGGS.includes(m.agg as Aggregation)) {
        measures.push({
          field: m.field,
          agg: m.agg as Aggregation,
          ...(typeof m.alias === 'string' ? { alias: m.alias } : {}),
        });
      }
    });
  }

  const dimensions: Dimension[] = [];
  if (Array.isArray(dimensionsRaw)) {
    dimensionsRaw.forEach((d, i) => {
      if (!isPlainObject(d)) {
        errors.push(`dimensions[${i}] must be an object`);
        return;
      }
      if (typeof d.field !== 'string' || d.field.length === 0) {
        errors.push(`dimensions[${i}].field is required`);
      }
      if (d.timeGrain !== undefined && !TIME_GRAINS.includes(d.timeGrain as TimeGrain)) {
        errors.push(`dimensions[${i}].timeGrain must be one of: ${TIME_GRAINS.join(', ')}`);
      }
      if (typeof d.field === 'string' && d.field.length > 0) {
        dimensions.push({
          field: d.field,
          ...(TIME_GRAINS.includes(d.timeGrain as TimeGrain) ? { timeGrain: d.timeGrain as TimeGrain } : {}),
        });
      }
    });
  }

  const filters: FilterClause[] = [];
  if (Array.isArray(filtersRaw)) {
    filtersRaw.forEach((f, i) => {
      if (!isPlainObject(f)) {
        errors.push(`filters[${i}] must be an object`);
        return;
      }
      if (typeof f.field !== 'string' || f.field.length === 0) {
        errors.push(`filters[${i}].field is required`);
      }
      if (typeof f.op !== 'string' || !FILTER_OPS.includes(f.op as FilterOp)) {
        errors.push(`filters[${i}].op must be one of: ${FILTER_OPS.join(', ')}`);
      }
      if (!('value' in f)) {
        errors.push(`filters[${i}].value is required`);
      }
      if (f.op === 'in' && !Array.isArray((f as Record<string, unknown>).value)) {
        errors.push(`filters[${i}].value must be an array when op is "in"`);
      }
      if (
        typeof f.field === 'string' &&
        typeof f.op === 'string' &&
        FILTER_OPS.includes(f.op as FilterOp) &&
        'value' in f
      ) {
        filters.push({ field: f.field, op: f.op as FilterOp, value: (f as Record<string, unknown>).value });
      }
    });
  }

  let sort: SortClause[] | undefined;
  if (Array.isArray(sortRaw)) {
    sort = [];
    sortRaw.forEach((s, i) => {
      if (!isPlainObject(s)) {
        errors.push(`sort[${i}] must be an object`);
        return;
      }
      if (typeof s.field !== 'string' || s.field.length === 0) {
        errors.push(`sort[${i}].field is required`);
      }
      if (typeof s.dir !== 'string' || !SORT_DIRS.includes(s.dir as SortDir)) {
        errors.push(`sort[${i}].dir must be one of: ${SORT_DIRS.join(', ')}`);
      }
      if (typeof s.field === 'string' && SORT_DIRS.includes(s.dir as SortDir)) {
        sort!.push({ field: s.field, dir: s.dir as SortDir });
      }
    });
  }

  let limit: number | undefined;
  if (input.limit !== undefined) {
    if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit <= 0) {
      errors.push('limit must be a positive integer');
    } else if (input.limit > MAX_LIMIT) {
      errors.push(`limit must not exceed ${MAX_LIMIT}`);
    } else {
      limit = input.limit;
    }
  }

  // A spec must either aggregate (>=1 measure) or be a raw table dump.
  // A raw table dump is: no measures. That is allowed. What is NOT allowed is
  // an empty spec that also declares dimensions but no measures where the intent
  // is ambiguous — but per contract dimensions-only is a valid grouped raw list.
  // The only hard requirement beyond a known dataset is structural validity,
  // already checked above. (measures non-empty OR raw table both pass.)

  // A spec with neither a measure nor a dimension has nothing to project and is
  // rejected downstream by the compiler — reject it here so validation matches.
  if (measures.length === 0 && dimensions.length === 0) {
    errors.push('spec must include at least one measure or dimension');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    spec: {
      dataset: dataset as Dataset,
      measures,
      dimensions,
      filters,
      ...(sort !== undefined ? { sort } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
  };
}

export function isValidChartType(v: unknown): v is ChartType {
  return typeof v === 'string' && CHART_TYPES.includes(v as ChartType);
}
