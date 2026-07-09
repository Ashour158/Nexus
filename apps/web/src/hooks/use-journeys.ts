import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { PaginatedResult } from '@nexus/shared-types';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Workflow/Journeys domain.
 */

export interface Journey {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  entryTrigger: string;
  entryConfig?: Record<string, unknown>;
  nodes?: unknown[];
  edges?: unknown[];
  settings?: Record<string, unknown>;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  enrolledCount?: number;
  conversionRate?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyEnrollment {
  id: string;
  journeyId: string;
  contactId: string;
  status: string;
  currentNodeId?: string | null;
  metadata?: Record<string, unknown>;
  enteredAt: string;
  exitedAt?: string | null;
}

type JourneyListResponse = PaginatedResult<Journey>;

export const journeyKeys = {
  all: ['journeys'] as const,
  lists: () => [...journeyKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...journeyKeys.lists(), f] as const,
  details: () => [...journeyKeys.all, 'detail'] as const,
  detail: (id: string) => [...journeyKeys.details(), id] as const,
  enrollments: (id: string) => [...journeyKeys.detail(id), 'enrollments'] as const,
};

export function useJourneys(filters: { page?: number; limit?: number } = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
  };
  return useQuery<JourneyListResponse>({
    queryKey: journeyKeys.list(normalized),
    queryFn: () =>
      apiClients.workflow.get<JourneyListResponse>('/journeys', {
        params: normalized,
      }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useJourney(id: string) {
  return useQuery<Journey>({
    queryKey: journeyKeys.detail(id),
    queryFn: () => apiClients.workflow.get<Journey>(`/journeys/${id}`),
    enabled: Boolean(id),
  });
}

export function useJourneyEnrollments(id: string, filters: { page?: number; limit?: number } = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
  };
  return useQuery<PaginatedResult<JourneyEnrollment>>({
    queryKey: journeyKeys.enrollments(id),
    queryFn: () =>
      apiClients.workflow.get<PaginatedResult<JourneyEnrollment>>(
        `/journeys/${id}/enrollments`,
        { params: normalized }
      ),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useCreateJourney() {
  const qc = useQueryClient();
  return useMutation<Journey, Error, { name: string; entryTrigger: string; description?: string; nodes?: unknown[]; edges?: unknown[]; settings?: Record<string, unknown> }>({
    mutationFn: (data) => apiClients.workflow.post<Journey>('/journeys', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journeyKeys.lists() });
      notify.success('Journey created');
    },
    onError: (err) => {
      notify.error('Failed to create journey', err.message);
    },
  });
}

export function useUpdateJourney() {
  const qc = useQueryClient();
  return useMutation<Journey, Error, { id: string; data: Partial<Journey> }>({
    mutationFn: ({ id, data }) =>
      apiClients.workflow.patch<Journey>(`/journeys/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: journeyKeys.detail(id) });
      qc.invalidateQueries({ queryKey: journeyKeys.lists() });
      notify.success('Journey updated');
    },
    onError: (err) => {
      notify.error('Failed to update journey', err.message);
    },
  });
}

export function useDeleteJourney() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.workflow.delete<void>(`/journeys/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: journeyKeys.detail(id) });
      qc.invalidateQueries({ queryKey: journeyKeys.lists() });
      notify.success('Journey deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete journey', err.message);
    },
  });
}

export function useActivateJourney() {
  const qc = useQueryClient();
  return useMutation<Journey, Error, string>({
    mutationFn: (id) =>
      apiClients.workflow.post<Journey>(`/journeys/${id}/activate`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: journeyKeys.detail(id) });
      qc.invalidateQueries({ queryKey: journeyKeys.lists() });
      notify.success('Journey activated');
    },
    onError: (err) => {
      notify.error('Failed to activate journey', err.message);
    },
  });
}

export function usePauseJourney() {
  const qc = useQueryClient();
  return useMutation<Journey, Error, string>({
    mutationFn: (id) =>
      apiClients.workflow.post<Journey>(`/journeys/${id}/pause`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: journeyKeys.detail(id) });
      qc.invalidateQueries({ queryKey: journeyKeys.lists() });
      notify.success('Journey paused');
    },
    onError: (err) => {
      notify.error('Failed to pause journey', err.message);
    },
  });
}

export function useArchiveJourney() {
  const qc = useQueryClient();
  return useMutation<Journey, Error, string>({
    mutationFn: (id) =>
      apiClients.workflow.post<Journey>(`/journeys/${id}/archive`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: journeyKeys.detail(id) });
      qc.invalidateQueries({ queryKey: journeyKeys.lists() });
      notify.success('Journey archived');
    },
    onError: (err) => {
      notify.error('Failed to archive journey', err.message);
    },
  });
}
