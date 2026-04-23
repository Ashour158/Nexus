import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  Activity,
  ActivityStatusLiteral,
  ActivityTypeLiteral,
  PaginatedResult,
} from '@nexus/shared-types';
import type {
  CreateActivityInput,
  UpdateActivityInput,
} from '@nexus/validation';
import { api } from '@/lib/api-client';

/**
 * React Query hooks for the Activities domain — Section 39.1.
 */

export interface ActivityListFilters {
  page?: number;
  limit?: number;
  ownerId?: string;
  dealId?: string;
  contactId?: string;
  leadId?: string;
  accountId?: string;
  type?: ActivityTypeLiteral;
  status?: ActivityStatusLiteral;
  overdue?: boolean;
  dueBefore?: string;
  dueAfter?: string;
}

export const activityKeys = {
  all: ['activities'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...activityKeys.lists(), f] as const,
  details: () => [...activityKeys.all, 'detail'] as const,
  detail: (id: string) => [...activityKeys.details(), id] as const,
  forDeal: (dealId: string) => [...activityKeys.all, 'deal', dealId] as const,
  upcoming: (ownerId: string, days: number) =>
    [...activityKeys.all, 'upcoming', ownerId, days] as const,
};

type ActivityListResponse = PaginatedResult<Activity>;

export function useActivities(filters: ActivityListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    ownerId: filters.ownerId,
    dealId: filters.dealId,
    contactId: filters.contactId,
    leadId: filters.leadId,
    accountId: filters.accountId,
    type: filters.type,
    status: filters.status,
    overdue: filters.overdue || undefined,
    dueBefore: filters.dueBefore,
    dueAfter: filters.dueAfter,
  };
  return useQuery<ActivityListResponse>({
    queryKey: activityKeys.list(normalized),
    queryFn: () =>
      api.get<ActivityListResponse>('/activities', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useActivity(id: string) {
  return useQuery<Activity>({
    queryKey: activityKeys.detail(id),
    queryFn: () => api.get<Activity>(`/activities/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpcomingActivities(ownerId: string, daysAhead = 7) {
  return useQuery<Activity[]>({
    queryKey: activityKeys.upcoming(ownerId, daysAhead),
    queryFn: () =>
      api.get<Activity[]>('/activities/upcoming', {
        params: { ownerId, daysAhead },
      }),
    enabled: Boolean(ownerId),
    staleTime: 60_000,
  });
}

export function useDealActivities(
  dealId: string,
  pagination: { page?: number; limit?: number } = {}
) {
  const normalized = {
    page: pagination.page ?? 1,
    limit: pagination.limit ?? 25,
  };
  return useQuery<ActivityListResponse>({
    queryKey: [...activityKeys.forDeal(dealId), normalized] as QueryKey,
    queryFn: () =>
      api.get<ActivityListResponse>(`/deals/${dealId}/activities`, {
        params: normalized,
      }),
    enabled: Boolean(dealId),
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation<Activity, Error, CreateActivityInput>({
    mutationFn: (data) => api.post<Activity>('/activities', data),
    onSuccess: (activity) => {
      qc.invalidateQueries({ queryKey: activityKeys.lists() });
      if (activity.dealId) {
        qc.invalidateQueries({ queryKey: activityKeys.forDeal(activity.dealId) });
      }
    },
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation<
    Activity,
    Error,
    { id: string; data: UpdateActivityInput }
  >({
    mutationFn: ({ id, data }) => api.patch<Activity>(`/activities/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: activityKeys.detail(id) });
      qc.invalidateQueries({ queryKey: activityKeys.lists() });
    },
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  interface DelCtx {
    previous: Array<[QueryKey, ActivityListResponse | undefined]>;
  }
  return useMutation<void, Error, string, DelCtx>({
    mutationFn: (id) => api.delete<void>(`/activities/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: activityKeys.lists() });
      const previous = qc.getQueriesData<ActivityListResponse>({
        queryKey: activityKeys.lists(),
      });
      qc.setQueriesData<ActivityListResponse>(
        { queryKey: activityKeys.lists() },
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          return { ...old, data: old.data.filter((a) => a.id !== id) };
        }
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => {
        if (data !== undefined) qc.setQueryData(key, data);
      });
    },
    onSettled: (_d, _e, id) => {
      qc.removeQueries({ queryKey: activityKeys.detail(id) });
      qc.invalidateQueries({ queryKey: activityKeys.lists() });
    },
  });
}

export function useCompleteActivity() {
  const qc = useQueryClient();
  return useMutation<
    Activity,
    Error,
    { id: string; outcome: string }
  >({
    mutationFn: ({ id, outcome }) =>
      api.post<Activity>(`/activities/${id}/complete`, { outcome }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: activityKeys.detail(id) });
      qc.invalidateQueries({ queryKey: activityKeys.all });
    },
  });
}

export function useRescheduleActivity() {
  const qc = useQueryClient();
  return useMutation<
    Activity,
    Error,
    { id: string; dueDate: string }
  >({
    mutationFn: ({ id, dueDate }) =>
      api.patch<Activity>(`/activities/${id}/reschedule`, { dueDate }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: activityKeys.detail(id) });
      qc.invalidateQueries({ queryKey: activityKeys.all });
    },
  });
}
