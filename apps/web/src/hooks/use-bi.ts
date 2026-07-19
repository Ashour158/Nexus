'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URLS, apiClients } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import type {
  BiDashboard,
  BiReport,
  BiReportSchedule,
  BiWidget,
  ChartType,
  Dataset,
  DrillDownSpec,
  ExportFormat,
  FieldCatalog,
  QueryResult,
  ReportSpec,
} from '@/lib/bi-types';

const analytics = apiClients.analytics;
const bi = apiClients.bi;

// ---------------------------------------------------------------------------
// Flexible query engine (analytics-service)
// ---------------------------------------------------------------------------

export function useFieldCatalog(dataset: Dataset) {
  return useQuery<FieldCatalog>({
    queryKey: ['analytics', 'fields', dataset],
    queryFn: () => analytics.get<FieldCatalog>('/query/fields', { params: { dataset } }),
    staleTime: 5 * 60_000,
  });
}

export function runQuery(spec: ReportSpec): Promise<QueryResult> {
  return analytics.post<QueryResult>('/query', spec);
}

/** Detail rows behind one aggregated chart point. */
export function runDrillDown(spec: DrillDownSpec): Promise<QueryResult> {
  return analytics.post<QueryResult>('/query/drilldown', spec);
}

/**
 * Field catalogs for several datasets at once — used by the join picker so
 * joined datasets' fields can appear (dotted) in the builder dropdowns.
 */
export function useFieldCatalogs(datasets: Dataset[]) {
  return useQueries({
    queries: datasets.map((dataset) => ({
      queryKey: ['analytics', 'fields', dataset],
      queryFn: () => analytics.get<FieldCatalog>('/query/fields', { params: { dataset } }),
      staleTime: 5 * 60_000,
    })),
  });
}

/** Live-preview query. Disabled until `enabled` is true (e.g. spec is valid). */
export function useQueryPreview(spec: ReportSpec | null, enabled: boolean) {
  return useQuery<QueryResult>({
    queryKey: ['analytics', 'query', spec],
    queryFn: () => runQuery(spec as ReportSpec),
    enabled: enabled && spec != null,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Dashboards (reporting-service)
// ---------------------------------------------------------------------------

export function useDashboards() {
  return useQuery<BiDashboard[]>({
    queryKey: ['bi', 'dashboards'],
    queryFn: () => bi.get<BiDashboard[]>('/dashboards'),
  });
}

export function useDashboard(id: string | undefined) {
  return useQuery<BiDashboard>({
    queryKey: ['bi', 'dashboard', id],
    queryFn: () => bi.get<BiDashboard>(`/dashboards/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; shared?: boolean }) =>
      bi.post<BiDashboard>('/dashboards', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'dashboards'] }),
  });
}

export function useUpdateDashboard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<BiDashboard, 'name' | 'description' | 'shared'>>) =>
      bi.patch<BiDashboard>(`/dashboards/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bi', 'dashboard', id] });
      qc.invalidateQueries({ queryKey: ['bi', 'dashboards'] });
    },
  });
}

export function useDeleteDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bi.delete<{ deleted: boolean }>(`/dashboards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'dashboards'] }),
  });
}

// ---- Widgets ----

export function useAddWidget(dashboardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; chartType: ChartType; spec: ReportSpec }) =>
      bi.post<BiWidget>(`/dashboards/${dashboardId}/widgets`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'dashboard', dashboardId] }),
  });
}

export function useUpdateWidget(dashboardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      widgetId,
      patch,
    }: {
      widgetId: string;
      patch: Partial<Pick<BiWidget, 'title' | 'chartType' | 'spec' | 'position'>>;
    }) => bi.patch<BiWidget>(`/dashboards/${dashboardId}/widgets/${widgetId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'dashboard', dashboardId] }),
  });
}

export function useDeleteWidget(dashboardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (widgetId: string) =>
      bi.delete<{ deleted: boolean }>(`/dashboards/${dashboardId}/widgets/${widgetId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'dashboard', dashboardId] }),
  });
}

export function useReorderWidgets(dashboardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: string[]) =>
      bi.put<BiWidget[]>(`/dashboards/${dashboardId}/widgets/reorder`, { order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'dashboard', dashboardId] }),
  });
}

// ---------------------------------------------------------------------------
// Reports (reporting-service)
// ---------------------------------------------------------------------------

export function useReports() {
  return useQuery<BiReport[]>({
    queryKey: ['bi', 'reports'],
    queryFn: () => bi.get<BiReport[]>('/reports'),
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; spec: ReportSpec }) =>
      bi.post<BiReport>('/reports', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'reports'] }),
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bi.delete<{ deleted: boolean }>(`/reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'reports'] }),
  });
}

export function runAdHocReport(spec: ReportSpec): Promise<QueryResult> {
  return bi.post<QueryResult>('/reports/run', { spec });
}

// ---------------------------------------------------------------------------
// Report schedules (recurring email delivery) + real file export
// ---------------------------------------------------------------------------

export function useReportSchedules(reportId: string | undefined) {
  return useQuery<BiReportSchedule[]>({
    queryKey: ['bi', 'schedules', reportId],
    queryFn: () => bi.get<BiReportSchedule[]>(`/reports/${reportId}/schedules`),
    enabled: Boolean(reportId),
  });
}

export function useCreateReportSchedule(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { cron: string; recipients: string[]; format?: string; subject?: string }) =>
      bi.post<BiReportSchedule>(`/reports/${reportId}/schedules`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'schedules', reportId] }),
  });
}

export function useToggleReportSchedule(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, isActive }: { scheduleId: string; isActive: boolean }) =>
      bi.patch<BiReportSchedule>(`/schedules/${scheduleId}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'schedules', reportId] }),
  });
}

export function useDeleteReportSchedule(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => bi.delete<{ deleted: boolean }>(`/schedules/${scheduleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi', 'schedules', reportId] }),
  });
}

/**
 * Download a saved report as a real file (csv / xlsx / pdf). Binary-safe:
 * fetches the bytes with the auth header and triggers a browser download —
 * window.open cannot carry the Authorization header.
 */
export async function downloadReportExport(
  reportId: string,
  format: ExportFormat,
  reportName: string
): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${BASE_URLS.bi}/reports/${reportId}/export?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportName.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'report'}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
