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
import { api, apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

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

export type DealHealth = 'won' | 'lost' | 'stalled' | 'at_risk' | 'healthy';

export interface DealScoringSignals {
  status?: string;
  isOpen?: boolean;
  isWon?: boolean;
  isLost?: boolean;
  dataQualityScore?: number | null;
  meddicScore?: number | null;
  meddic?: Record<string, unknown>;
  stageId?: string;
  stageName?: string | null;
  stageAgeDays?: number;
  rottenDays?: number | null;
  isRotten?: boolean;
  daysSinceLastActivity?: number | null;
  probability?: number;
  amount?: number;
  currency?: string;
  expectedCloseDate?: string | null;
}

/**
 * A single explainable factor behind an AI prediction. `impact` is the signed
 * contribution to the estimate expressed in percentage points; `direction`
 * mirrors its sign for quick styling.
 */
export interface AiPredictionFactor {
  label: string;
  direction: 'up' | 'down';
  impact: number;
  explanation: string;
}

/**
 * Explainable AI prediction payload — shared by deals (`scoring-insights.ai`)
 * and leads (`ai-prediction.insights`). `lowData` is surfaced honestly in the
 * UI: when true the model is falling back to priors and confidence is low.
 */
export interface AiPredictionInsights {
  probability: number;
  confidence: number;
  lowData: boolean;
  modelVersion: string;
  sampleSize: number;
  topFactors: AiPredictionFactor[];
  nextBestActions?: string[];
}

/** The `ai` block attached to `GET /deals/:id/scoring-insights`. */
export interface DealAiPrediction {
  winProbability: number;
  score: number;
  insights: AiPredictionInsights;
}

/**
 * Deterministic (NOT AI) deal-health insights returned by
 * `GET /deals/:id/scoring-insights`. `healthScore` is optional because the
 * service derives a categorical `health` label; the UI computes a numeric
 * score from the label when the backend omits it. The optional `ai` block
 * carries the explainable AI win prediction (rendered above the deterministic
 * health section).
 */
export interface DealScoringInsights {
  dealId: string;
  healthScore?: number | null;
  health: DealHealth;
  signals: DealScoringSignals;
  recommendations: string[];
  ai?: DealAiPrediction | null;
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
  /** Narrow to renewal deals (`?isRenewal=true`). */
  isRenewal?: boolean;
  /** ISO cutoff — deals whose contract ends before this (`?contractEndBefore=`). */
  contractEndBefore?: string;
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
      apiClients.deals.get<DealListResponse>('/deals', {
        // crm caps list limit at 100 (>100 → 422); pipeline board pages at 100.
        params: { pipelineId, limit: 100, ...filters },
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
    isRenewal: filters.isRenewal ? 'true' : undefined,
    contractEndBefore: filters.contractEndBefore,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
  return useQuery<DealListResponse>({
    queryKey: dealKeys.list(normalized),
    queryFn: () => apiClients.deals.get<DealListResponse>('/deals', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Fetches a single deal with full relations (account, stage, contacts). */
export function useDeal(id: string) {
  return useQuery<Deal>({
    queryKey: dealKeys.detail(id),
    queryFn: () => apiClients.deals.get<Deal>(`/deals/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Fetches deterministic deal-health scoring insights (health label, signals,
 * recommendations) from `GET /deals/:id/scoring-insights`.
 */
export function useDealScoringInsights(id: string) {
  return useQuery<DealScoringInsights>({
    queryKey: dealKeys.insights(id),
    queryFn: () => api.get<DealScoringInsights>(`/deals/${id}/scoring-insights`),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

/** @deprecated Renamed to {@link useDealScoringInsights}. */
export const useDealAiInsights = useDealScoringInsights;

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
    mutationFn: (data) => apiClients.deals.post<Deal>('/deals', data),
    onSuccess: (_deal, vars) => {
      qc.invalidateQueries({ queryKey: dealKeys.pipeline(vars.pipelineId) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
      notify.success('Deal created');
    },
    onError: (err) => {
      notify.error('Failed to create deal', err.message);
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation<Deal, Error, { id: string; data: UpdateDealInput }>({
    mutationFn: ({ id, data }) => apiClients.deals.patch<Deal>(`/deals/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
      notify.success('Deal updated');
    },
    onError: (err) => {
      notify.error('Failed to update deal', err.message);
    },
  });
}

/**
 * Optimistic in-place deal patch — the driving mutation for the Kanban
 * card quick-edit (amount / expectedCloseDate / probability, etc.).
 *
 * Mirrors {@link useMoveDeal}: it snapshots every cached deals query, patches
 * the target row across all of them for instant feedback, and rolls the whole
 * snapshot back on error. It is intentionally quiet on success (no toast) since
 * it fires on blur/Enter during inline editing; errors surface via the api
 * client's global error toast plus a rollback. Invalidates on settle to
 * reconcile with the server (e.g. amount recompute from line items).
 */
export function useQuickUpdateDeal() {
  const qc = useQueryClient();

  interface QuickUpdateVars {
    id: string;
    data: UpdateDealInput;
  }
  interface QuickUpdateContext {
    previous: Array<[QueryKey, DealListResponse | undefined]>;
  }

  return useMutation<Deal, Error, QuickUpdateVars, QuickUpdateContext>({
    mutationFn: ({ id, data }) => apiClients.deals.patch<Deal>(`/deals/${id}`, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: dealKeys.all });

      const previous = qc.getQueriesData<DealListResponse>({
        queryKey: dealKeys.all,
      });

      qc.setQueriesData<DealListResponse>({ queryKey: dealKeys.all }, (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: old.data.map((d) =>
            d.id === id ? ({ ...d, ...data } as Deal) : d
          ),
        };
      });

      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach(([key, data]) => {
        if (data !== undefined) qc.setQueryData(key, data);
      });
      // The api client already surfaces a global error toast.
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

/**
 * Converts a deal into a renewal, spinning off a new renewal deal linked back
 * to the source via `renewedFromDealId`. Returns the newly-created renewal.
 */
export function useConvertDealToRenewal() {
  const qc = useQueryClient();
  return useMutation<
    Deal,
    Error,
    { id: string; contractEndDate?: string; renewalProbability?: number }
  >({
    mutationFn: ({ id, contractEndDate, renewalProbability }) =>
      api.post<Deal>(`/deals/${id}/convert-to-renewal`, {
        ...(contractEndDate ? { contractEndDate } : {}),
        ...(renewalProbability != null ? { renewalProbability } : {}),
      }),
    onSuccess: (_deal, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
      notify.success('Renewal created');
    },
    onError: (err) => {
      notify.error('Failed to create renewal', err.message);
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
      notify.error('Failed to move deal');
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
      if (!_e) notify.success('Deal stage updated');
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
      notify.success('Deal marked won');
    },
    onError: (err) => {
      notify.error('Failed to mark deal won', err.message);
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
      notify.success('Deal marked lost');
    },
    onError: (err) => {
      notify.error('Failed to mark deal lost', err.message);
    },
  });
}

export function useCloneDeal() {
  const qc = useQueryClient();
  return useMutation<Deal, Error, { id: string; name?: string }>({
    mutationFn: ({ id, name }) => api.post<Deal>(`/deals/${id}/clone`, name !== undefined ? { name } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.all });
      notify.success('Deal cloned');
    },
    onError: (err) => {
      notify.error('Failed to clone deal', err.message);
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.deals.delete<void>(`/deals/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.all });
      notify.success('Deal deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete deal', err.message);
    },
  });
}
