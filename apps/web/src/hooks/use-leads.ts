import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  Lead,
  LeadStatusLiteral,
  PaginatedResult,
} from '@nexus/shared-types';
import type { CreateLeadInput, UpdateLeadInput } from '@nexus/validation';
import { api, apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import type { AiPredictionInsights } from '@/hooks/use-deals';

/**
 * React Query hooks for the Leads domain — Section 39.1.
 *
 * Mirrors the shape of `use-deals.ts`:
 *   - Typed `leadKeys` factory drives every cache entry.
 *   - `useLeads` / `useLead` are standard queries.
 *   - `useUpdateLeadStatus` + `useDeleteLead` perform optimistic cache updates
 *     with rollback on failure.
 */

export interface LeadListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatusLiteral;
  ownerId?: string;
  source?: string;
  sortBy?: 'createdAt' | 'score' | 'firstName' | 'company';
  sortDir?: 'asc' | 'desc';
}

export const leadKeys = {
  all: ['leads'] as const,
  lists: () => [...leadKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...leadKeys.lists(), f] as const,
  details: () => [...leadKeys.all, 'detail'] as const,
  detail: (id: string) => [...leadKeys.details(), id] as const,
  aiPrediction: (id: string) => [...leadKeys.detail(id), 'ai-prediction'] as const,
};

type LeadListResponse = PaginatedResult<Lead>;

/**
 * Explainable AI lead prediction returned by `GET /leads/:id/ai-prediction`.
 * `aiScore` is the 0-100 projection of `probability`; `insights` carries the
 * confidence, low-data honesty flag and the "why" factor list.
 */
export interface LeadAiPrediction {
  probability: number;
  aiScore: number;
  insights: AiPredictionInsights;
}

/**
 * Fetches the explainable AI prediction for a lead. The endpoint returns the
 * standard `{ success, data }` envelope; the typed client unwraps `data`.
 */
export function useLeadAiPrediction(id: string, enabled = true) {
  return useQuery<LeadAiPrediction>({
    queryKey: leadKeys.aiPrediction(id),
    queryFn: () => api.get<LeadAiPrediction>(`/leads/${id}/ai-prediction`),
    enabled: Boolean(id) && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useLeads(filters: LeadListFilters = {}) {
  const normalized = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    search: filters.search?.trim() || undefined,
    status: filters.status,
    ownerId: filters.ownerId,
    source: filters.source,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
  return useQuery<LeadListResponse>({
    queryKey: leadKeys.list(normalized),
    queryFn: () =>
      apiClients.leads.get<LeadListResponse>('/leads', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useLead(id: string) {
  return useQuery<Lead>({
    queryKey: leadKeys.detail(id),
    queryFn: () => apiClients.leads.get<Lead>(`/leads/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation<Lead, Error, CreateLeadInput>({
    mutationFn: (data) => apiClients.leads.post<Lead>('/leads', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
      notify.success('Lead created');
    },
    onError: (err) => {
      notify.error('Failed to create lead', err.message);
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation<Lead, Error, { id: string; data: UpdateLeadInput }>({
    mutationFn: ({ id, data }) => apiClients.leads.patch<Lead>(`/leads/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: leadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
      notify.success('Lead updated');
    },
    onError: (err) => {
      notify.error('Failed to update lead', err.message);
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();

  interface DeleteLeadContext {
    previous: Array<[QueryKey, LeadListResponse | undefined]>;
  }

  return useMutation<void, Error, string, DeleteLeadContext>({
    mutationFn: (id) => apiClients.leads.delete<void>(`/leads/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: leadKeys.lists() });
      const previous = qc.getQueriesData<LeadListResponse>({
        queryKey: leadKeys.lists(),
      });
      qc.setQueriesData<LeadListResponse>(
        { queryKey: leadKeys.lists() },
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          return {
            ...old,
            data: old.data.filter((l) => l.id !== id),
            total: Math.max(0, (old.total ?? 1) - 1),
          };
        }
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => {
        if (data !== undefined) qc.setQueryData(key, data);
      });
      notify.error('Failed to delete lead');
    },
    onSettled: (_d, _e, id) => {
      qc.removeQueries({ queryKey: leadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
      if (!_e) notify.success('Lead deleted');
    },
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  interface ConvertLeadVars {
    id: string;
    accountName?: string;
    createDeal?: boolean;
    dealName?: string;
    dealAmount?: number;
    pipelineId?: string;
  }
  interface ConvertLeadResult {
    leadId: string;
    contactId: string;
    accountId: string;
    dealId?: string;
  }
  return useMutation<ConvertLeadResult, Error, ConvertLeadVars>({
    mutationFn: ({ id, ...body }) =>
      apiClients.leads.post<ConvertLeadResult>(`/leads/${id}/convert`, body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: leadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
      notify.success('Lead converted');
    },
    onError: (err) => {
      notify.error('Failed to convert lead', err.message);
    },
  });
}

/**
 * Optimistic Kanban-style status update used by the leads board. Mirrors the
 * pattern of `useMoveDeal`.
 */
export function useUpdateLeadStatus() {
  const qc = useQueryClient();

  interface UpdateStatusVars {
    id: string;
    status: LeadStatusLiteral;
  }
  interface UpdateStatusContext {
    previous: Array<[QueryKey, LeadListResponse | undefined]>;
  }

  return useMutation<Lead, Error, UpdateStatusVars, UpdateStatusContext>({
    mutationFn: ({ id, status }) =>
      apiClients.leads.patch<Lead>(`/leads/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const previous = qc.getQueriesData<LeadListResponse>({
        queryKey: leadKeys.all,
      });
      qc.setQueriesData<LeadListResponse>(
        { queryKey: leadKeys.all },
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          return {
            ...old,
            data: old.data.map((l) => (l.id === id ? { ...l, status } : l)),
          };
        }
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => {
        if (data !== undefined) qc.setQueryData(key, data);
      });
      notify.error('Failed to update lead status');
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: leadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: leadKeys.all });
      if (!_e) notify.success('Lead status updated');
    },
  });
}
