'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import type {
  BiDashboard,
  BiReport,
  BiWidget,
  ChartType,
  Dataset,
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
