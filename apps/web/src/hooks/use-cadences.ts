import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Cadences domain.
 */

// ─── Query-key factory ──────────────────────────────────────────────────────

export const cadenceKeys = {
  all: ['cadences'] as const,
  lists: () => [...cadenceKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...cadenceKeys.lists(), f] as const,
  details: () => [...cadenceKeys.all, 'detail'] as const,
  detail: (id: string) => [...cadenceKeys.details(), id] as const,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BackendCadenceStep {
  position: number;
  type: 'EMAIL' | 'CALL_TASK' | 'LINKEDIN_TASK' | 'SMS' | 'WAIT';
  delayDays?: number;
  subject?: string;
  body?: string;
  taskTitle?: string;
  variantB?: Record<string, unknown>;
}

export interface Cadence {
  id: string;
  name: string;
  description?: string;
  objectType: 'CONTACT' | 'LEAD';
  isActive?: boolean;
  exitOnReply?: boolean;
  exitOnMeeting?: boolean;
  steps: BackendCadenceStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCadenceInput {
  name: string;
  description?: string;
  objectType: 'CONTACT' | 'LEAD';
  isActive?: boolean;
  exitOnReply?: boolean;
  exitOnMeeting?: boolean;
  steps: BackendCadenceStep[];
}

export interface UpdateCadenceInput extends Partial<CreateCadenceInput> {}

// ─── Queries ────────────────────────────────────────────────────────────────

export function useCadences(filters: Record<string, unknown> = {}) {
  return useQuery<Cadence[]>({
    queryKey: cadenceKeys.list(filters),
    queryFn: () => apiClients.cadence.get<Cadence[]>('/cadences'),
    staleTime: 30_000,
  });
}

export function useCadence(id: string) {
  return useQuery<Cadence>({
    queryKey: cadenceKeys.detail(id),
    queryFn: () => apiClients.cadence.get<Cadence>(`/cadences/${id}`),
    enabled: Boolean(id),
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateCadence() {
  const qc = useQueryClient();
  return useMutation<Cadence, Error, CreateCadenceInput>({
    mutationFn: (data) => apiClients.cadence.post<Cadence>('/cadences', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cadenceKeys.lists() });
      notify.success('Cadence created');
    },
    onError: (err) => {
      notify.error('Failed to create cadence', err.message);
    },
  });
}

export function useUpdateCadence() {
  const qc = useQueryClient();
  return useMutation<Cadence, Error, { id: string; data: UpdateCadenceInput }>({
    mutationFn: ({ id, data }) =>
      apiClients.cadence.patch<Cadence>(`/cadences/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: cadenceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: cadenceKeys.lists() });
      notify.success('Cadence updated');
    },
    onError: (err) => {
      notify.error('Failed to update cadence', err.message);
    },
  });
}

export function useDeleteCadence() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.cadence.delete<void>(`/cadences/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: cadenceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: cadenceKeys.lists() });
      notify.success('Cadence deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete cadence', err.message);
    },
  });
}
