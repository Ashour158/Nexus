import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  Deal,
  PaginatedResult,
  TimelineEvent,
} from '@nexus/shared-types';
import type { CreateDealInput, UpdateDealInput } from '@nexus/validation';
import { api } from '@/lib/api-client';

/**
 * React Query hooks for the Deals domain — Section 39.2.
 *
 * All hooks delegate to the typed CRM client (`api`), which unwraps the
 * `{ success, data }` envelope so consumers receive the payload directly.
 */

// ─── Query-key factory ──────────────────────────────────────────────────────

export const dealKeys = {
  all: ['deals'] as const,
  lists: () => [...dealKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...dealKeys.lists(), f] as const,
  details: () => [...dealKeys.all, 'detail'] as const,
  detail: (id: string) => [...dealKeys.details(), id] as const,
  pipeline: (pid: string) => [...dealKeys.all, 'pipeline', pid] as const,
  timeline: (id: string) => [...dealKeys.detail(id), 'timeline'] as const,
  insights: (id: string) => [...dealKeys.detail(id), 'insights'] as const,
};

// ─── Query response shapes ──────────────────────────────────────────────────

export interface DealAiInsights {
  dealId: string;
  aiWinProbability: number | null;
  aiInsights: unknown;
}

type DealListResponse = PaginatedResult<Deal>;
type TimelineResponse = PaginatedResult<TimelineEvent>;

export interface DealListFilters {
  page?: number;
  limit?: number;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  accountId?: string;
  status?: Deal['status'];
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'amount' | 'expectedCloseDate';
  sortDir?: 'asc' | 'desc';
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** Fetches all deals in a pipeline (up to 500) — used by the Kanban board. */
export function usePipelineDeals(
  pipelineId: string,
  filters: Record<string, unknown> = {}
) {
  return useQuery<DealListResponse>({
    queryKey: dealKeys.pipeline(pipelineId),
    queryFn: () =>
      api.get<DealListResponse>('/deals', {
        params: { pipelineId, limit: 500, ...filters },
      }),
    staleTime: 30_000,
    enabled: Boolean(pipelineId),
  });
}

/** Generic paginated deals query with filtering. */
export function useDeals(filters: DealListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    pipelineId: filters.pipelineId,
    stageId: filters.stageId,
    ownerId: filters.ownerId,
    accountId: filters.accountId,
    status: filters.status,
    search: filters.search?.trim() || undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
  return useQuery<DealListResponse>({
    queryKey: dealKeys.list(normalized),
    queryFn: () => api.get<DealListResponse>('/deals', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Fetches a single deal with full relations (account, stage, contacts). */
export function useDeal(id: string) {
  return useQuery<Deal>({
    queryKey: dealKeys.detail(id),
    queryFn: () => api.get<Deal>(`/deals/${id}`),
    enabled: Boolean(id),
  });
}

/** Fetches the AI insights blob + win probability for a deal. */
export function useDealAiInsights(id: string) {
  return useQuery<DealAiInsights>({
    queryKey: dealKeys.insights(id),
    queryFn: () => api.get<DealAiInsights>(`/deals/${id}/ai-insights`),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

/** Fetches the chronological timeline for a deal. */
export function useDealTimeline(id: string) {
  return useQuery<TimelineResponse>({
    queryKey: dealKeys.timeline(id),
    queryFn: () => api.get<TimelineResponse>(`/deals/${id}/timeline`),
    enabled: Boolean(id),
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation<Deal, Error, CreateDealInput>({
    mutationFn: (data) => api.post<Deal>('/deals', data),
    onSuccess: (_deal, vars) => {
      qc.invalidateQueries({ queryKey: dealKeys.pipeline(vars.pipelineId) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation<Deal, Error, { id: string; data: UpdateDealInput }>({
    mutationFn: ({ id, data }) => api.patch<Deal>(`/deals/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
    },
  });
}

/**
 * Moves a deal to a new stage with an optimistic cache update — the driving
 * mutation for the Kanban drag-and-drop (Section 53.1).
 */
export function useMoveDeal() {
  const qc = useQueryClient();

  interface MoveDealVars {
    id: string;
    stageId: string;
  }
  interface MoveDealContext {
    previous: Array<[QueryKey, DealListResponse | undefined]>;
  }

  return useMutation<Deal, Error, MoveDealVars, MoveDealContext>({
    mutationFn: ({ id, stageId }) =>
      api.patch<Deal>(`/deals/${id}/stage`, { stageId }),
    onMutate: async ({ id, stageId }) => {
      await qc.cancelQueries({ queryKey: dealKeys.all });

      const previous = qc.getQueriesData<DealListResponse>({
        queryKey: dealKeys.all,
      });

      qc.setQueriesData<DealListResponse>(
        { queryKey: dealKeys.all },
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          return {
            ...old,
            data: old.data.map((d) => (d.id === id ? { ...d, stageId } : d)),
          };
        }
      );

      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach(([key, data]) => {
        if (data !== undefined) {
          qc.setQueryData(key, data);
        }
      });
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useMarkDealWon() {
  const qc = useQueryClient();
  return useMutation<Deal, Error, string>({
    mutationFn: (id) => api.post<Deal>(`/deals/${id}/won`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useMarkDealLost() {
  const qc = useQueryClient();
  return useMutation<
    Deal,
    Error,
    { id: string; reason: string; detail?: string }
  >({
    mutationFn: ({ id, reason, detail }) =>
      api.post<Deal>(`/deals/${id}/lost`, { reason, detail }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete<void>(`/deals/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}
