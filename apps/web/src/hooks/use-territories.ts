import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClients } from '@/lib/api-client';

/**
 * Territory routing hook — targets territory-service (Section 3019,
 * `apiClients.territory` → `/api/v1/territories/**`).
 *
 * The service is a rule-based routing engine: each Territory carries a
 * priority-ordered set of `{field, operator, value}` rules; a record matches a
 * territory when ALL its rules pass, and the winning territory assigns an owner
 * (single owner or round-robin across `ownerIds`). These hooks cover the real
 * contract — list/detail/create/update/delete, routing-log audit trail, and the
 * dry-run test-assignment endpoint.
 *
 * Dev-mock note: list/routing-log reads degrade to empty on a 404 so the UI
 * shows an empty state instead of an error when the service is not wired.
 */

export type TerritoryType = 'GEOGRAPHIC' | 'INDUSTRY' | 'ACCOUNT_SIZE' | 'CUSTOM';
export type RuleOperator = 'eq' | 'neq' | 'contains' | 'gte' | 'lte' | 'in';

export const TERRITORY_TYPES: { value: TerritoryType; label: string }[] = [
  { value: 'GEOGRAPHIC', label: 'Geographic' },
  { value: 'INDUSTRY', label: 'Industry' },
  { value: 'ACCOUNT_SIZE', label: 'Account Size' },
  { value: 'CUSTOM', label: 'Custom' },
];

export const RULE_OPERATORS: { value: RuleOperator; label: string; hint: string }[] = [
  { value: 'eq', label: 'equals', hint: 'exact match' },
  { value: 'neq', label: 'not equals', hint: 'exact non-match' },
  { value: 'contains', label: 'contains', hint: 'case-insensitive substring' },
  { value: 'gte', label: '≥ (at least)', hint: 'numeric compare' },
  { value: 'lte', label: '≤ (at most)', hint: 'numeric compare' },
  { value: 'in', label: 'in list', hint: 'comma-separated values' },
];

export interface TerritoryRule {
  id?: string;
  field: string;
  operator: string;
  value: string;
}

export interface Territory {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  type: TerritoryType;
  ownerIds: string[];
  teamId?: string | null;
  priority: number;
  isActive: boolean;
  isDefault: boolean;
  currency?: string | null;
  createdAt: string;
  updatedAt: string;
  rules?: TerritoryRule[];
  ruleCount?: number;
}

export interface TerritoryInput {
  name: string;
  description?: string;
  type: TerritoryType;
  ownerIds: string[];
  teamId?: string;
  priority?: number;
  isDefault?: boolean;
  rules: TerritoryRule[];
}

export interface RoutingLog {
  id: string;
  tenantId: string;
  leadId: string;
  recordType: string;
  matchedTerritoryId?: string | null;
  territory?: Pick<Territory, 'id' | 'name' | 'type'> | null;
  matchedRuleIds: string[];
  viaDefault: boolean;
  assignedOwnerId?: string | null;
  routedAt: string;
}

export interface RoutingLogPage {
  data: RoutingLog[];
  total: number;
  page: number;
  limit: number;
}

export interface TestAssignmentResult {
  territory: Territory;
  assignedOwnerId: string | null;
  matchedRuleIds: string[];
  viaDefault: boolean;
}

export const territoryKeys = {
  all: ['territories'] as const,
  lists: () => [...territoryKeys.all, 'list'] as const,
  detail: (id: string) => [...territoryKeys.all, 'detail', id] as const,
  routingLogs: (leadId?: string) =>
    [...territoryKeys.all, 'routing-logs', leadId ?? 'all'] as const,
};

function is404(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

export function useTerritories() {
  return useQuery<Territory[]>({
    queryKey: territoryKeys.lists(),
    queryFn: async () => {
      try {
        return await apiClients.territory.get<Territory[]>('/territories');
      } catch (err) {
        // Degrade to empty when the service isn't wired (dev-mock 404).
        if (is404(err)) return [];
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export function useTerritory(id: string | null) {
  return useQuery<Territory | null>({
    queryKey: territoryKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      try {
        return await apiClients.territory.get<Territory>(`/territories/${id}`);
      } catch (err) {
        if (is404(err)) return null;
        throw err;
      }
    },
  });
}

export function useCreateTerritory() {
  const qc = useQueryClient();
  return useMutation<Territory, Error, TerritoryInput>({
    mutationFn: (body) => apiClients.territory.post<Territory>('/territories', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: territoryKeys.all }),
  });
}

export function useUpdateTerritory() {
  const qc = useQueryClient();
  return useMutation<Territory, Error, { id: string; data: Partial<TerritoryInput> }>({
    mutationFn: ({ id, data }) =>
      apiClients.territory.patch<Territory>(`/territories/${id}`, data),
    onSuccess: (_t, { id }) => {
      qc.invalidateQueries({ queryKey: territoryKeys.lists() });
      qc.invalidateQueries({ queryKey: territoryKeys.detail(id) });
    },
  });
}

export function useDeleteTerritory() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiClients.territory.delete(`/territories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: territoryKeys.all }),
  });
}

export function useRoutingLogs(leadId?: string, page = 1, limit = 20) {
  return useQuery<RoutingLogPage>({
    queryKey: [...territoryKeys.routingLogs(leadId), page, limit],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, limit };
      if (leadId) params.leadId = leadId;
      try {
        return await apiClients.territory.get<RoutingLogPage>('/territories/routing-logs', {
          params,
        });
      } catch (err) {
        if (is404(err)) return { data: [], total: 0, page, limit };
        throw err;
      }
    },
    staleTime: 15_000,
  });
}

export function useTestAssignment() {
  return useMutation<TestAssignmentResult | null, Error, Record<string, unknown>>({
    mutationFn: (record) =>
      apiClients.territory.post<TestAssignmentResult | null>(
        '/territories/test-assignment',
        record
      ),
  });
}
