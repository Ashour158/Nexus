import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the event-driven Automation Rules admin — workflow-service.
 *
 * All hooks delegate to the typed workflow client (`apiClients.workflow`, base
 * → workflow-service `/api/v1`). The client unwraps the `{ success, data }`
 * envelope, so list/runs endpoints hand back the row array directly and `/meta`
 * hands back the catalog object.
 */

// ─── Wire shapes (mirror workflow-service prisma + service) ──────────────────

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'is_empty'
  | 'is_not_empty';

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface RuleAction {
  type: string;
  config: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  module: string;
  triggerEvent: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isActive: boolean;
  runCount: number;
  lastRunAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRuleRun {
  id: string;
  tenantId: string;
  ruleId: string;
  eventId: string;
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  error?: string | null;
  ranAt: string;
}

export interface AutomationMeta {
  modules: { module: string; triggerEvents: string[] }[];
  actionTypes: string[];
  operators: ConditionOperator[];
}

export interface AutomationRuleFilters {
  module?: string;
  triggerEvent?: string;
  isActive?: boolean;
}

export interface AutomationRuleInput {
  name: string;
  description?: string;
  module: string;
  triggerEvent: string;
  conditions?: RuleCondition[];
  actions: RuleAction[];
  isActive?: boolean;
}

// ─── Query-key factory ───────────────────────────────────────────────────────

export const automationRuleKeys = {
  all: ['automation-rules'] as const,
  meta: () => [...automationRuleKeys.all, 'meta'] as const,
  lists: () => [...automationRuleKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...automationRuleKeys.lists(), f] as const,
  details: () => [...automationRuleKeys.all, 'detail'] as const,
  detail: (id: string) => [...automationRuleKeys.details(), id] as const,
  runs: (id: string) => [...automationRuleKeys.detail(id), 'runs'] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useAutomationMeta() {
  return useQuery<AutomationMeta>({
    queryKey: automationRuleKeys.meta(),
    queryFn: () => apiClients.workflow.get<AutomationMeta>('/automation-rules/meta'),
    staleTime: 5 * 60_000,
  });
}

export function useAutomationRules(filters: AutomationRuleFilters = {}) {
  const normalized: Record<string, unknown> = {
    module: filters.module || undefined,
    triggerEvent: filters.triggerEvent || undefined,
    isActive: filters.isActive === undefined ? undefined : String(filters.isActive),
  };
  return useQuery<AutomationRule[]>({
    queryKey: automationRuleKeys.list(normalized),
    queryFn: () => apiClients.workflow.get<AutomationRule[]>('/automation-rules', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useAutomationRule(id: string) {
  return useQuery<AutomationRule>({
    queryKey: automationRuleKeys.detail(id),
    queryFn: () => apiClients.workflow.get<AutomationRule>(`/automation-rules/${id}`),
    enabled: Boolean(id),
  });
}

export function useAutomationRuleRuns(id: string, enabled = true) {
  return useQuery<AutomationRuleRun[]>({
    queryKey: automationRuleKeys.runs(id),
    queryFn: () => apiClients.workflow.get<AutomationRuleRun[]>(`/automation-rules/${id}/runs`),
    enabled: Boolean(id) && enabled,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateAutomationRule() {
  const qc = useQueryClient();
  return useMutation<AutomationRule, Error, AutomationRuleInput>({
    mutationFn: (data) => apiClients.workflow.post<AutomationRule>('/automation-rules', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: automationRuleKeys.lists() });
      notify.success('Automation rule created');
    },
    onError: (err) => notify.error('Failed to create rule', err.message),
  });
}

export function useUpdateAutomationRule() {
  const qc = useQueryClient();
  return useMutation<AutomationRule, Error, { id: string; data: Partial<AutomationRuleInput> }>({
    mutationFn: ({ id, data }) => apiClients.workflow.patch<AutomationRule>(`/automation-rules/${id}`, data),
    onSuccess: (_r, { id }) => {
      qc.invalidateQueries({ queryKey: automationRuleKeys.detail(id) });
      qc.invalidateQueries({ queryKey: automationRuleKeys.lists() });
      notify.success('Automation rule updated');
    },
    onError: (err) => notify.error('Failed to update rule', err.message),
  });
}

export function useToggleAutomationRule() {
  const qc = useQueryClient();
  return useMutation<AutomationRule, Error, string>({
    mutationFn: (id) => apiClients.workflow.post<AutomationRule>(`/automation-rules/${id}/toggle`),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: automationRuleKeys.detail(id) });
      qc.invalidateQueries({ queryKey: automationRuleKeys.lists() });
    },
    onError: (err) => notify.error('Failed to toggle rule', err.message),
  });
}

export function useDeleteAutomationRule() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) => apiClients.workflow.delete<{ id: string }>(`/automation-rules/${id}`),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: automationRuleKeys.detail(id) });
      qc.invalidateQueries({ queryKey: automationRuleKeys.lists() });
      notify.success('Automation rule deleted');
    },
    onError: (err) => notify.error('Failed to delete rule', err.message),
  });
}
