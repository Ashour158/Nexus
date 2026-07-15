/** Client-safe BI / analytics report-spec types (mirrors analytics-service). */

export type AggFn = 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max';
export type TimeGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
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

export interface ReportSpecMeasure {
  field?: string;
  agg?: AggFn;
  /** Calculated measure — arithmetic over earlier measure aliases (e.g. "won / total"). */
  formula?: string;
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

export interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'boolean';
}

export interface FieldCatalog {
  dataset: Dataset;
  table: string;
  measures: FieldDef[];
  dimensions: FieldDef[];
  filters: FieldDef[];
}

export interface QueryResultColumn {
  key: string;
  label: string;
  type: string;
}
export interface QueryResult {
  columns: QueryResultColumn[];
  rows: Array<Record<string, unknown>>;
}

export interface BiWidget {
  id: string;
  dashboardId: string;
  title: string;
  chartType: ChartType;
  spec: ReportSpec;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BiDashboard {
  id: string;
  name: string;
  description?: string;
  shared: boolean;
  widgets: BiWidget[];
  createdAt: string;
  updatedAt: string;
}

export interface BiReport {
  id: string;
  name: string;
  description?: string;
  spec: ReportSpec;
  createdAt: string;
  updatedAt: string;
}

export const DATASETS: Array<{ value: Dataset; label: string }> = [
  { value: 'deals', label: 'Deals' },
  { value: 'leads', label: 'Leads' },
  { value: 'activities', label: 'Activities' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'orders', label: 'Orders' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'commissions', label: 'Commissions' },
];

export const AGG_FNS: Array<{ value: AggFn; label: string }> = [
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
  { value: 'count_distinct', label: 'Count distinct' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

export const TIME_GRAINS: Array<{ value: TimeGrain; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export const FILTER_OPS: Array<{ value: FilterOp; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'in', label: 'in' },
  { value: 'contains', label: 'contains' },
];

export const CHART_TYPES: Array<{ value: ChartType; label: string }> = [
  { value: 'kpi', label: 'KPI card' },
  { value: 'bar', label: 'Bar' },
  { value: 'stacked_bar', label: 'Stacked bar' },
  { value: 'hbar', label: 'Horizontal bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'combo', label: 'Combo (bar + line)' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'radar', label: 'Radar' },
  { value: 'treemap', label: 'Treemap' },
  { value: 'radial', label: 'Radial gauge' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'table', label: 'Table' },
];
