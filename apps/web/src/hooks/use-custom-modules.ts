'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

const api = apiClients.customModules;

// ---------------------------------------------------------------------------
// Types (mirror metadata-service low-code platform)
// ---------------------------------------------------------------------------

export type FieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'PICKLIST'
  | 'MULTISELECT'
  | 'EMAIL'
  | 'PHONE'
  | 'CURRENCY'
  | 'FORMULA'
  | 'LOOKUP';

export const FIELD_TYPES: FieldType[] = [
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'PICKLIST',
  'MULTISELECT',
  'EMAIL',
  'PHONE',
  'CURRENCY',
  'FORMULA',
  'LOOKUP',
];

export interface CustomModule {
  id: string;
  label: string;
  pluralLabel: string;
  apiName: string;
  description?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomField {
  id: string;
  moduleId: string;
  label: string;
  apiName: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  order: number;
  options?: string[];
  formula?: string;
  lookupModule?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutSection {
  title: string;
  columns: number;
  fields: string[];
}

export interface CustomLayout {
  id: string;
  moduleId: string;
  name: string;
  sections: LayoutSection[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomRecord {
  id: string;
  moduleId: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecordListResult {
  data: CustomRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface FieldIssue {
  field: string;
  message: string;
}

/** A 422 validation error carrying per-field issues (thrown by the API client). */
export class ValidationError extends Error {
  issues: FieldIssue[];
  constructor(issues: FieldIssue[]) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export const moduleKeys = {
  all: ['custom-modules'] as const,
  modules: () => [...moduleKeys.all, 'modules'] as const,
  module: (id: string) => [...moduleKeys.all, 'module', id] as const,
  fields: (moduleId: string) => [...moduleKeys.all, 'fields', moduleId] as const,
  layouts: (moduleId: string) => [...moduleKeys.all, 'layouts', moduleId] as const,
  records: (moduleId: string, filters: Record<string, unknown>) =>
    [...moduleKeys.all, 'records', moduleId, filters] as const,
  record: (moduleId: string, recordId: string) =>
    [...moduleKeys.all, 'record', moduleId, recordId] as const,
};

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export function useCustomModules() {
  return useQuery<CustomModule[]>({
    queryKey: moduleKeys.modules(),
    queryFn: () => api.get<CustomModule[]>('/custom-modules'),
  });
}

export function useCustomModule(moduleId: string | undefined) {
  return useQuery<CustomModule>({
    queryKey: moduleKeys.module(moduleId ?? ''),
    queryFn: () => api.get<CustomModule>(`/custom-modules/${moduleId}`),
    enabled: Boolean(moduleId),
  });
}

export function useCreateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CustomModule>) => api.post<CustomModule>('/custom-modules', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.modules() }),
  });
}

export function useUpdateModule(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CustomModule>) =>
      api.patch<CustomModule>(`/custom-modules/${moduleId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moduleKeys.modules() });
      qc.invalidateQueries({ queryKey: moduleKeys.module(moduleId) });
    },
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) => api.delete<{ deleted: boolean }>(`/custom-modules/${moduleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.modules() }),
  });
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export function useModuleFields(moduleId: string | undefined) {
  return useQuery<CustomField[]>({
    queryKey: moduleKeys.fields(moduleId ?? ''),
    queryFn: () => api.get<CustomField[]>(`/custom-modules/${moduleId}/fields`),
    enabled: Boolean(moduleId),
  });
}

export function useCreateField(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CustomField>) =>
      api.post<CustomField>(`/custom-modules/${moduleId}/fields`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.fields(moduleId) }),
  });
}

export function useUpdateField(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, patch }: { fieldId: string; patch: Partial<CustomField> }) =>
      api.patch<CustomField>(`/custom-modules/${moduleId}/fields/${fieldId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.fields(moduleId) }),
  });
}

export function useDeleteField(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) =>
      api.delete<{ deleted: boolean }>(`/custom-modules/${moduleId}/fields/${fieldId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.fields(moduleId) }),
  });
}

export function useReorderFields(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Backend expects `{ order: [{ id, sortOrder }] }`; map the ordered id array
    // to positional sortOrder entries before POSTing.
    mutationFn: (order: string[]) =>
      api.patch<CustomField[]>(`/custom-modules/${moduleId}/fields/reorder`, {
        order: order.map((id, index) => ({ id, sortOrder: index })),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.fields(moduleId) }),
  });
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

export function useModuleLayouts(moduleId: string | undefined) {
  return useQuery<CustomLayout[]>({
    queryKey: moduleKeys.layouts(moduleId ?? ''),
    queryFn: () => api.get<CustomLayout[]>(`/custom-modules/${moduleId}/layouts`),
    enabled: Boolean(moduleId),
  });
}

export function useCreateLayout(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; sections: LayoutSection[]; isDefault?: boolean }) =>
      api.post<CustomLayout>(`/custom-modules/${moduleId}/layouts`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.layouts(moduleId) }),
  });
}

export function useUpdateLayout(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layoutId, patch }: { layoutId: string; patch: Partial<CustomLayout> }) =>
      api.patch<CustomLayout>(`/custom-modules/${moduleId}/layouts/${layoutId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: moduleKeys.layouts(moduleId) }),
  });
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export function useModuleRecords(
  moduleId: string | undefined,
  filters: { page?: number; pageSize?: number; filter?: string } = {}
) {
  const normalized = {
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 25,
    filter: filters.filter ?? '',
  };
  return useQuery<RecordListResult>({
    queryKey: moduleKeys.records(moduleId ?? '', normalized),
    queryFn: () =>
      api.get<RecordListResult>(`/custom-modules/${moduleId}/records`, {
        params: {
          page: normalized.page,
          pageSize: normalized.pageSize,
          ...(normalized.filter ? { filter: normalized.filter } : {}),
        },
      }),
    enabled: Boolean(moduleId),
  });
}

export function useModuleRecord(moduleId: string | undefined, recordId: string | undefined) {
  return useQuery<CustomRecord>({
    queryKey: moduleKeys.record(moduleId ?? '', recordId ?? ''),
    queryFn: () => api.get<CustomRecord>(`/custom-modules/${moduleId}/records/${recordId}`),
    enabled: Boolean(moduleId && recordId),
  });
}

/** Extracts per-field issues from a 422 axios error, if present. */
function toValidationError(err: unknown): ValidationError | null {
  const response = (err as { response?: { status?: number; data?: { error?: { issues?: FieldIssue[] } } } })
    .response;
  if (response?.status === 422 && Array.isArray(response.data?.error?.issues)) {
    return new ValidationError(response.data!.error!.issues as FieldIssue[]);
  }
  return null;
}

export function useCreateRecord(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      try {
        return await api.post<CustomRecord>(`/custom-modules/${moduleId}/records`, { values });
      } catch (err) {
        const validation = toValidationError(err);
        if (validation) throw validation;
        throw err;
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...moduleKeys.all, 'records', moduleId] }),
  });
}

export function useUpdateRecord(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordId, values }: { recordId: string; values: Record<string, unknown> }) => {
      try {
        return await api.patch<CustomRecord>(`/custom-modules/${moduleId}/records/${recordId}`, { values });
      } catch (err) {
        const validation = toValidationError(err);
        if (validation) throw validation;
        throw err;
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...moduleKeys.all, 'records', moduleId] }),
  });
}

export function useDeleteRecord(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) =>
      api.delete<{ deleted: boolean }>(`/custom-modules/${moduleId}/records/${recordId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...moduleKeys.all, 'records', moduleId] }),
  });
}

// ---------------------------------------------------------------------------
// Formula preview
// ---------------------------------------------------------------------------

/** Result of a formula preview evaluation (mirrors the metadata-service engine). */
export interface FormulaEvalResult {
  ok: boolean;
  value: number | string | boolean | null;
  error?: string;
}

export function evaluateFormula(formula: string, record: Record<string, unknown>) {
  // Backend returns `{ success, data: { ok, value, error? } }`; the api client
  // unwraps `data`, so this resolves to `{ ok, value, error? }`.
  return api.post<FormulaEvalResult>('/formula/evaluate', { formula, record });
}
