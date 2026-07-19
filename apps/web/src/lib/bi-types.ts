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
  | 'pivot'
  | 'kpi';

/** Excel-style "show value as" transforms, applied client-side to the rows. */
export type QuickCalc = 'percent_of_total' | 'running_total' | 'growth' | 'rank';

export interface ReportSpecMeasure {
  field?: string;
  agg?: AggFn;
  /** Calculated measure — arithmetic over earlier measure aliases (e.g. "won / total"). */
  formula?: string;
  /** Client-side "show value as" transform. */
  quickCalc?: QuickCalc;
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
/**
 * Cross-object join: attach another dataset's latest attributes to the base
 * rows. `on` is the foreign-key field on the BASE dataset (e.g. 'account_id');
 * joined fields are referenced as "<dataset>.<field>" (alias defaults to the
 * dataset name).
 */
export interface ReportSpecJoin {
  dataset: Dataset;
  on: string;
  alias?: string;
}
export interface ReportSpec {
  dataset: Dataset;
  joins?: ReportSpecJoin[];
  measures: ReportSpecMeasure[];
  dimensions: ReportSpecDimension[];
  filters?: ReportSpecFilter[];
  sort?: Array<{ field: string; dir: 'asc' | 'desc' }>;
  limit?: number;
}

/** One clicked chart coordinate, for drill-down into the underlying rows. */
export interface DrillPoint {
  field: string;
  timeGrain?: TimeGrain;
  value: unknown;
}
export interface DrillDownSpec {
  dataset: Dataset;
  joins?: ReportSpecJoin[];
  filters?: ReportSpecFilter[];
  at?: DrillPoint[];
  columns?: string[];
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

/** Recurring email delivery of a saved BI report (reporting-service cron runner). */
export interface BiReportSchedule {
  id: string;
  reportId: string;
  cron: string;
  recipients: string[];
  format: string;
  subject?: string | null;
  isActive: boolean;
  lastRunAt?: string | null;
  lastError?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export const EXPORT_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'pdf'];

/**
 * The entity-identity column per dataset (mirrors the analytics compiler's
 * DATASET_KEY). Used to suggest which base fields can be a join key.
 */
export const DATASET_KEY: Record<Dataset, string> = {
  deals: 'deal_id',
  leads: 'lead_id',
  activities: 'activity_id',
  revenue: 'deal_id',
  quotes: 'quote_id',
  contacts: 'contact_id',
  accounts: 'account_id',
  orders: 'order_id',
  invoices: 'invoice_id',
  tickets: 'ticket_id',
  campaigns: 'campaign_id',
  subscriptions: 'subscription_id',
  commissions: 'commission_id',
};

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
  { value: 'pivot', label: 'Pivot table' },
];

export const QUICK_CALCS: Array<{ value: QuickCalc; label: string }> = [
  { value: 'percent_of_total', label: '% of total' },
  { value: 'running_total', label: 'Running total' },
  { value: 'growth', label: 'Growth vs previous' },
  { value: 'rank', label: 'Rank' },
];
