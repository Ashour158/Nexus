export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  isTemplate: true;
  datasource: 'crm' | 'analytics' | 'finance';
  querySpec: Record<string, unknown>;
}

export const SYSTEM_TEMPLATES: ReportTemplate[] = [
  {
    id: 'tpl-pipeline-by-stage',
    name: 'Pipeline by Stage',
    description: 'Open deals grouped by pipeline stage with totals',
    category: 'Pipeline',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'deal', columns: ['stageId', 'count', 'sum(amount)'], filters: [{ field: 'status', operator: 'eq', value: 'OPEN' }], groupBy: 'stageId' },
  },
  {
    id: 'tpl-pipeline-by-rep',
    name: 'Pipeline by Rep',
    description: 'Open deals grouped by owner with totals',
    category: 'Pipeline',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'deal', columns: ['ownerId', 'count', 'sum(amount)', 'avg(probability)'], filters: [{ field: 'status', operator: 'eq', value: 'OPEN' }], groupBy: 'ownerId' },
  },
  {
    id: 'tpl-won-lost-analysis',
    name: 'Won / Lost Analysis',
    description: 'Win rate and lost reasons breakdown',
    category: 'Revenue',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'deal', columns: ['status', 'lostReason', 'count', 'sum(amount)'], filters: [{ field: 'status', operator: 'in', value: 'WON,LOST' }], groupBy: 'status,lostReason' },
  },
  {
    id: 'tpl-activities-by-rep',
    name: 'Activities by Rep',
    description: 'Activity counts per rep by type',
    category: 'Activities',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'activity', columns: ['ownerId', 'type', 'count'], groupBy: 'ownerId,type' },
  },
  {
    id: 'tpl-lead-source-roi',
    name: 'Lead Source ROI',
    description: 'Leads and conversion by source',
    category: 'Leads',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'lead', columns: ['source', 'count'], groupBy: 'source' },
  },
  {
    id: 'tpl-revenue-by-quarter',
    name: 'Revenue by Quarter',
    description: 'Won revenue trend by quarter',
    category: 'Revenue',
    isTemplate: true,
    datasource: 'analytics',
    querySpec: { endpoint: '/revenue/summary', columns: ['totalRevenue', 'wonDeals', 'winRate'] },
  },
  {
    id: 'tpl-revenue-by-product',
    name: 'Revenue by Product',
    description: 'Revenue grouped by product line items',
    category: 'Revenue',
    isTemplate: true,
    datasource: 'finance',
    querySpec: { endpoint: '/quotes', columns: ['quoteNumber', 'total', 'status'] },
  },
  {
    id: 'tpl-overdue-activities',
    name: 'Overdue Activities',
    description: 'Open activities past due date',
    category: 'Activities',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'activity', columns: ['subject', 'ownerId', 'dueDate', 'status'], filters: [{ field: 'overdue', operator: 'eq', value: 'true' }] },
  },
  {
    id: 'tpl-lead-conversion-funnel',
    name: 'Lead Conversion Funnel',
    description: 'Lead counts by lifecycle status',
    category: 'Leads',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'lead', columns: ['status', 'count'], groupBy: 'status' },
  },
  {
    id: 'tpl-forecast-vs-quota',
    name: 'Forecast vs Quota',
    description: 'Committed forecast compared with quota plans',
    category: 'Forecast',
    isTemplate: true,
    datasource: 'analytics',
    querySpec: { endpoint: '/forecast/weighted-pipeline', columns: ['weightedPipeline', 'totalPipeline', 'winRate'] },
  },
  {
    id: 'tpl-commission-by-rep',
    name: 'Commission by Rep',
    description: 'Closed won revenue suitable for commission calculations',
    category: 'Revenue',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'deal', columns: ['ownerId', 'sum(amount)', 'count'], filters: [{ field: 'status', operator: 'eq', value: 'WON' }], groupBy: 'ownerId' },
  },
  {
    id: 'tpl-customer-health-distribution',
    name: 'Customer Health Distribution',
    description: 'Accounts grouped by customer health status',
    category: 'Pipeline',
    isTemplate: true,
    datasource: 'crm',
    querySpec: { entity: 'account', columns: ['status', 'count', 'avg(healthScore)'], groupBy: 'status' },
  },
];
