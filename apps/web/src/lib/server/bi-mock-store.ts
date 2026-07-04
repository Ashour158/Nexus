/**
 * In-memory dev-preview store for reporting-service (/api/v1/bi/*).
 *
 * Persists across requests within a single dev server process so the dashboard
 * builder works end-to-end (create dashboard -> add widget -> reorder -> run)
 * without a live reporting-service. Seeded with one sample dashboard + report.
 */
import type { ReportSpec } from './analytics-mock';

export interface BiWidget {
  id: string;
  dashboardId: string;
  title: string;
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'table' | 'kpi' | 'funnel';
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

interface BiState {
  dashboards: BiDashboard[];
  reports: BiReport[];
}

const g = globalThis as unknown as { __nexusBiStore?: BiState };

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function seed(): BiState {
  const dashId = 'dash_sample';
  const ts = nowIso();
  return {
    dashboards: [
      {
        id: dashId,
        name: 'Sales Overview',
        description: 'Pipeline and revenue at a glance',
        shared: true,
        createdAt: ts,
        updatedAt: ts,
        widgets: [
          {
            id: id('wdg'),
            dashboardId: dashId,
            title: 'Total pipeline',
            chartType: 'kpi',
            position: 0,
            createdAt: ts,
            updatedAt: ts,
            spec: {
              dataset: 'deals',
              measures: [{ field: 'amount', agg: 'sum', alias: 'pipeline' }],
              dimensions: [],
              filters: [{ field: 'status', op: 'eq', value: 'OPEN' }],
            },
          },
          {
            id: id('wdg'),
            dashboardId: dashId,
            title: 'Deals by stage',
            chartType: 'bar',
            position: 1,
            createdAt: ts,
            updatedAt: ts,
            spec: {
              dataset: 'deals',
              measures: [{ field: 'id', agg: 'count', alias: 'deals' }],
              dimensions: [{ field: 'stageId' }],
            },
          },
          {
            id: id('wdg'),
            dashboardId: dashId,
            title: 'Revenue by owner',
            chartType: 'table',
            position: 2,
            createdAt: ts,
            updatedAt: ts,
            spec: {
              dataset: 'revenue',
              measures: [{ field: 'amount', agg: 'sum', alias: 'revenue' }],
              dimensions: [{ field: 'ownerId' }],
              limit: 10,
            },
          },
        ],
      },
    ],
    reports: [
      {
        id: 'rpt_sample',
        name: 'Won deals by month',
        description: 'Monthly closed-won trend',
        createdAt: ts,
        updatedAt: ts,
        spec: {
          dataset: 'revenue',
          measures: [{ field: 'amount', agg: 'sum', alias: 'revenue' }],
          dimensions: [{ field: 'updatedAt', timeGrain: 'month' }],
        },
      },
    ],
  };
}

export function biStore(): BiState {
  if (!g.__nexusBiStore) {
    g.__nexusBiStore = seed();
  }
  return g.__nexusBiStore;
}

// ---- Dashboards ----
export function listDashboards(): BiDashboard[] {
  return biStore().dashboards.map((d) => ({ ...d, widgets: d.widgets }));
}

export function getDashboard(dashboardId: string): BiDashboard | undefined {
  return biStore().dashboards.find((d) => d.id === dashboardId);
}

export function createDashboard(input: Partial<BiDashboard>): BiDashboard {
  const ts = nowIso();
  const dashboard: BiDashboard = {
    id: id('dash'),
    name: input.name || 'Untitled dashboard',
    description: input.description,
    shared: Boolean(input.shared),
    widgets: [],
    createdAt: ts,
    updatedAt: ts,
  };
  biStore().dashboards.unshift(dashboard);
  return dashboard;
}

export function updateDashboard(
  dashboardId: string,
  patch: Partial<BiDashboard>
): BiDashboard | undefined {
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) return undefined;
  if (patch.name !== undefined) dashboard.name = patch.name;
  if (patch.description !== undefined) dashboard.description = patch.description;
  if (patch.shared !== undefined) dashboard.shared = patch.shared;
  dashboard.updatedAt = nowIso();
  return dashboard;
}

export function deleteDashboard(dashboardId: string): boolean {
  const store = biStore();
  const before = store.dashboards.length;
  store.dashboards = store.dashboards.filter((d) => d.id !== dashboardId);
  return store.dashboards.length < before;
}

// ---- Widgets ----
export function addWidget(dashboardId: string, input: Partial<BiWidget>): BiWidget | undefined {
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) return undefined;
  const ts = nowIso();
  const widget: BiWidget = {
    id: id('wdg'),
    dashboardId,
    title: input.title || 'Untitled widget',
    chartType: input.chartType || 'table',
    spec: input.spec as ReportSpec,
    position: dashboard.widgets.length,
    createdAt: ts,
    updatedAt: ts,
  };
  dashboard.widgets.push(widget);
  dashboard.updatedAt = ts;
  return widget;
}

export function updateWidget(
  dashboardId: string,
  widgetId: string,
  patch: Partial<BiWidget>
): BiWidget | undefined {
  const dashboard = getDashboard(dashboardId);
  const widget = dashboard?.widgets.find((w) => w.id === widgetId);
  if (!widget) return undefined;
  if (patch.title !== undefined) widget.title = patch.title;
  if (patch.chartType !== undefined) widget.chartType = patch.chartType;
  if (patch.spec !== undefined) widget.spec = patch.spec;
  if (patch.position !== undefined) widget.position = patch.position;
  widget.updatedAt = nowIso();
  return widget;
}

export function deleteWidget(dashboardId: string, widgetId: string): boolean {
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) return false;
  const before = dashboard.widgets.length;
  dashboard.widgets = dashboard.widgets.filter((w) => w.id !== widgetId);
  dashboard.widgets.forEach((w, index) => (w.position = index));
  return dashboard.widgets.length < before;
}

export function reorderWidgets(dashboardId: string, orderedIds: string[]): BiWidget[] | undefined {
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) return undefined;
  const byId = new Map(dashboard.widgets.map((w) => [w.id, w]));
  const reordered: BiWidget[] = [];
  orderedIds.forEach((wid, index) => {
    const widget = byId.get(wid);
    if (widget) {
      widget.position = index;
      reordered.push(widget);
    }
  });
  // Append any widgets not in the ordered list
  dashboard.widgets.forEach((w) => {
    if (!orderedIds.includes(w.id)) reordered.push(w);
  });
  dashboard.widgets = reordered;
  return reordered;
}

// ---- Reports ----
export function listReports(): BiReport[] {
  return biStore().reports;
}

export function getReport(reportId: string): BiReport | undefined {
  return biStore().reports.find((r) => r.id === reportId);
}

export function createReport(input: Partial<BiReport>): BiReport {
  const ts = nowIso();
  const report: BiReport = {
    id: id('rpt'),
    name: input.name || 'Untitled report',
    description: input.description,
    spec: input.spec as ReportSpec,
    createdAt: ts,
    updatedAt: ts,
  };
  biStore().reports.unshift(report);
  return report;
}

export function updateReport(reportId: string, patch: Partial<BiReport>): BiReport | undefined {
  const report = getReport(reportId);
  if (!report) return undefined;
  if (patch.name !== undefined) report.name = patch.name;
  if (patch.description !== undefined) report.description = patch.description;
  if (patch.spec !== undefined) report.spec = patch.spec;
  report.updatedAt = nowIso();
  return report;
}

export function deleteReport(reportId: string): boolean {
  const store = biStore();
  const before = store.reports.length;
  store.reports = store.reports.filter((r) => r.id !== reportId);
  return store.reports.length < before;
}
