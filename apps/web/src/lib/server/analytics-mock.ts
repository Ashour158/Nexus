/**
 * Dev-preview mock for the analytics flexible-query engine.
 *
 * Mirrors the shape returned by analytics-service:
 *  - GET /api/v1/analytics/query/fields  -> field catalog per dataset
 *  - POST /api/v1/analytics/query        -> { columns, rows } for a ReportSpec
 *
 * The mock runs the ReportSpec (measures / dimensions / filters / sort / limit)
 * against the in-memory dev-preview state so the builder is genuinely usable
 * without a live backend.
 */
import { getDevPreviewState } from './dev-preview-data';

export type AggFn = 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max';
export type TimeGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
export type Dataset = 'deals' | 'leads' | 'activities' | 'revenue' | 'quotes';

export interface ReportSpecMeasure {
  field: string;
  agg: AggFn;
  alias?: string;
}
export interface ReportSpecDimension {
  field: string;
  timeGrain?: TimeGrain;
}
export interface ReportSpecFilter {
  field: string;
  op: FilterOp;
  value: unknown;
}
export interface ReportSpec {
  dataset: Dataset;
  measures: ReportSpecMeasure[];
  dimensions: ReportSpecDimension[];
  filters?: ReportSpecFilter[];
  sort?: Array<{ field: string; dir: 'asc' | 'desc' }>;
  limit?: number;
}

interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'boolean';
}

interface FieldCatalog {
  dataset: Dataset;
  table: string;
  measures: FieldDef[];
  dimensions: FieldDef[];
  filters: FieldDef[];
}

const CATALOGS: Record<Dataset, FieldCatalog> = {
  deals: {
    dataset: 'deals',
    table: 'crm.deals',
    measures: [
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'id', label: 'Deal count', type: 'number' },
    ],
    dimensions: [
      { key: 'stageId', label: 'Stage', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'ownerId', label: 'Owner', type: 'string' },
      { key: 'accountName', label: 'Account', type: 'string' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
      { key: 'updatedAt', label: 'Updated date', type: 'date' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'stageId', label: 'Stage', type: 'string' },
      { key: 'ownerId', label: 'Owner', type: 'string' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
    ],
  },
  leads: {
    dataset: 'leads',
    table: 'crm.leads',
    measures: [
      { key: 'id', label: 'Lead count', type: 'number' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'aiScore', label: 'AI score', type: 'number' },
    ],
    dimensions: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'source', label: 'Source', type: 'string' },
      { key: 'ownerId', label: 'Owner', type: 'string' },
      { key: 'company', label: 'Company', type: 'string' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'source', label: 'Source', type: 'string' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
    ],
  },
  activities: {
    dataset: 'activities',
    table: 'crm.activities',
    measures: [{ key: 'id', label: 'Activity count', type: 'number' }],
    dimensions: [
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'ownerId', label: 'Owner', type: 'string' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
    ],
    filters: [
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
    ],
  },
  revenue: {
    dataset: 'revenue',
    table: 'crm.deals',
    measures: [
      { key: 'amount', label: 'Revenue', type: 'currency' },
      { key: 'id', label: 'Won deals', type: 'number' },
    ],
    dimensions: [
      { key: 'ownerId', label: 'Owner', type: 'string' },
      { key: 'accountName', label: 'Account', type: 'string' },
      { key: 'updatedAt', label: 'Close date', type: 'date' },
    ],
    filters: [
      { key: 'ownerId', label: 'Owner', type: 'string' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'updatedAt', label: 'Close date', type: 'date' },
    ],
  },
  quotes: {
    dataset: 'quotes',
    table: 'crm.quotes',
    measures: [
      { key: 'total', label: 'Total', type: 'currency' },
      { key: 'discountTotal', label: 'Discount total', type: 'currency' },
      { key: 'id', label: 'Quote count', type: 'number' },
    ],
    dimensions: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'ownerId', label: 'Owner', type: 'string' },
      { key: 'currency', label: 'Currency', type: 'string' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'total', label: 'Total', type: 'currency' },
      { key: 'createdAt', label: 'Created date', type: 'date' },
    ],
  },
};

export function getFieldCatalog(dataset: Dataset): FieldCatalog | null {
  return CATALOGS[dataset] ?? null;
}

function rowsForDataset(dataset: Dataset): Array<Record<string, unknown>> {
  const state = getDevPreviewState();
  switch (dataset) {
    case 'deals':
      return state.deals as Array<Record<string, unknown>>;
    case 'revenue':
      return (state.deals as Array<Record<string, unknown>>).filter(
        (deal) => deal.status === 'WON'
      );
    case 'leads':
      return state.leads as Array<Record<string, unknown>>;
    case 'activities':
      return state.activities as Array<Record<string, unknown>>;
    case 'quotes':
      return state.quotes as Array<Record<string, unknown>>;
    default:
      return [];
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bucketDate(value: unknown, grain: TimeGrain): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  switch (grain) {
    case 'year':
      return String(y);
    case 'quarter':
      return `${y}-Q${Math.floor(m / 3) + 1}`;
    case 'month':
      return `${y}-${String(m + 1).padStart(2, '0')}`;
    case 'week': {
      const day = new Date(Date.UTC(y, m, date.getUTCDate()));
      const dayNum = (day.getUTCDay() + 6) % 7;
      day.setUTCDate(day.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
      const week =
        1 +
        Math.round(
          ((day.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
        );
      return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'day':
    default:
      return date.toISOString().slice(0, 10);
  }
}

function matchesFilter(row: Record<string, unknown>, filter: ReportSpecFilter): boolean {
  const raw = row[filter.field];
  const { op, value } = filter;
  switch (op) {
    case 'eq':
      return String(raw) === String(value);
    case 'neq':
      return String(raw) !== String(value);
    case 'gt':
      return toNumber(raw) > toNumber(value);
    case 'gte':
      return toNumber(raw) >= toNumber(value);
    case 'lt':
      return toNumber(raw) < toNumber(value);
    case 'lte':
      return toNumber(raw) <= toNumber(value);
    case 'in': {
      const list = Array.isArray(value)
        ? value.map(String)
        : String(value)
            .split(',')
            .map((v) => v.trim());
      return list.includes(String(raw));
    }
    case 'contains':
      return String(raw ?? '').toLowerCase().includes(String(value).toLowerCase());
    default:
      return true;
  }
}

function aggregate(values: number[], distinct: unknown[], agg: AggFn): number {
  switch (agg) {
    case 'count':
      return values.length;
    case 'count_distinct':
      return new Set(distinct.map(String)).size;
    case 'sum':
      return values.reduce((acc, v) => acc + v, 0);
    case 'avg':
      return values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
    case 'min':
      return values.length ? Math.min(...values) : 0;
    case 'max':
      return values.length ? Math.max(...values) : 0;
    default:
      return 0;
  }
}

function measureAlias(m: ReportSpecMeasure): string {
  return m.alias || `${m.agg}_${m.field}`;
}

/** Run a ReportSpec against dev-preview data and return { columns, rows }. */
export function runMockQuery(spec: ReportSpec): {
  columns: Array<{ key: string; label: string; type: string }>;
  rows: Array<Record<string, unknown>>;
} {
  const catalog = getFieldCatalog(spec.dataset);
  let data = rowsForDataset(spec.dataset);

  for (const filter of spec.filters ?? []) {
    data = data.filter((row) => matchesFilter(row, filter));
  }

  const dims = spec.dimensions ?? [];
  const measures = spec.measures ?? [];

  const dimKey = (row: Record<string, unknown>) =>
    dims
      .map((d) => (d.timeGrain ? bucketDate(row[d.field], d.timeGrain) : String(row[d.field] ?? '—')))
      .join('');

  const groups = new Map<string, Record<string, unknown>[]>();
  if (dims.length === 0) {
    groups.set('__all__', data);
  } else {
    for (const row of data) {
      const key = dimKey(row);
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
  }

  const outRows: Array<Record<string, unknown>> = [];
  for (const bucket of groups.values()) {
    const out: Record<string, unknown> = {};
    dims.forEach((d) => {
      const sample = bucket[0];
      out[d.field] = d.timeGrain
        ? bucketDate(sample?.[d.field], d.timeGrain)
        : sample?.[d.field] ?? '—';
    });
    measures.forEach((m) => {
      const values = bucket.map((r) => toNumber(r[m.field]));
      const distinct = bucket.map((r) => r[m.field]);
      out[measureAlias(m)] = aggregate(values, distinct, m.agg);
    });
    outRows.push(out);
  }

  // Sort
  const sort = spec.sort?.[0];
  if (sort) {
    outRows.sort((a, b) => {
      const av = a[sort.field];
      const bv = b[sort.field];
      const an = Number(av);
      const bn = Number(bv);
      let cmp: number;
      if (Number.isFinite(an) && Number.isFinite(bn)) cmp = an - bn;
      else cmp = String(av).localeCompare(String(bv));
      return sort.dir === 'desc' ? -cmp : cmp;
    });
  } else if (measures[0]) {
    const alias = measureAlias(measures[0]);
    outRows.sort((a, b) => toNumber(b[alias]) - toNumber(a[alias]));
  }

  const limited = spec.limit ? outRows.slice(0, spec.limit) : outRows;

  const columns: Array<{ key: string; label: string; type: string }> = [];
  dims.forEach((d) => {
    const def = catalog?.dimensions.find((f) => f.key === d.field);
    columns.push({
      key: d.field,
      label: def?.label ?? d.field,
      type: d.timeGrain ? 'string' : def?.type ?? 'string',
    });
  });
  measures.forEach((m) => {
    const def = catalog?.measures.find((f) => f.key === m.field);
    columns.push({
      key: measureAlias(m),
      label: m.alias || `${aggLabel(m.agg)} ${def?.label ?? m.field}`,
      type: m.agg === 'count' || m.agg === 'count_distinct' ? 'number' : def?.type ?? 'number',
    });
  });

  return { columns, rows: limited };
}

function aggLabel(agg: AggFn): string {
  return (
    {
      sum: 'Sum of',
      count: 'Count of',
      count_distinct: 'Distinct',
      avg: 'Avg',
      min: 'Min',
      max: 'Max',
    } as Record<AggFn, string>
  )[agg];
}
