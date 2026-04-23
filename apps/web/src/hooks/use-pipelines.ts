import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pipeline, Stage } from '@nexus/shared-types';
import { api } from '@/lib/api-client';

/**
 * Query hooks for pipeline & stage reference data. Both are short-TTL caches
 * because the data rarely changes during a user session (Section 31.2).
 */

export const pipelineKeys = {
  all: ['pipelines'] as const,
  list: () => [...pipelineKeys.all, 'list'] as const,
  detail: (id: string) => [...pipelineKeys.all, 'detail', id] as const,
  stages: (pipelineId: string) =>
    [...pipelineKeys.detail(pipelineId), 'stages'] as const,
};

/** Fetches every pipeline visible to the tenant (typically a small set). */
export function usePipelines() {
  return useQuery<Pipeline[]>({
    queryKey: pipelineKeys.list(),
    queryFn: () => api.get<Pipeline[]>('/pipelines'),
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetches all stages for a single pipeline, ordered by `stage.order`.
 * The query only runs once `pipelineId` is truthy so it's safe to call from
 * forms where the user hasn't yet selected a pipeline.
 */
export function useStages(pipelineId: string | null | undefined) {
  return useQuery<Stage[]>({
    queryKey: pipelineKeys.stages(pipelineId ?? ''),
    queryFn: () =>
      api.get<Stage[]>(`/pipelines/${pipelineId as string}/stages`),
    enabled: Boolean(pipelineId),
    staleTime: 5 * 60_000,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation<Pipeline, Error, { name: string; currency: string }>({
    mutationFn: (data) => api.post<Pipeline>('/pipelines', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineKeys.list() }),
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation<
    Pipeline,
    Error,
    { id: string; data: Partial<{ name: string; currency: string; isDefault: boolean; isActive: boolean }> }
  >({
    mutationFn: ({ id, data }) => api.patch<Pipeline>(`/pipelines/${id}`, data),
    onSuccess: (_r, { id }) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.list() });
      qc.invalidateQueries({ queryKey: pipelineKeys.detail(id) });
    },
  });
}

export function useArchivePipeline() {
  const qc = useQueryClient();
  return useMutation<{ id: string; deleted: boolean }, Error, string>({
    mutationFn: (id) => api.delete<{ id: string; deleted: boolean }>(`/pipelines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineKeys.list() }),
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation<
    Stage,
    Error,
    {
      pipelineId: string;
      data: { name: string; order: number; probability: number; rottenDays: number; color?: string };
    }
  >({
    mutationFn: ({ pipelineId, data }) => api.post<Stage>(`/pipelines/${pipelineId}/stages`, data),
    onSuccess: (_s, { pipelineId }) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) });
      qc.invalidateQueries({ queryKey: pipelineKeys.list() });
    },
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation<
    Stage,
    Error,
    {
      pipelineId: string;
      stageId: string;
      data: Partial<{ name: string; order: number; probability: number; rottenDays: number; color: string }>;
    }
  >({
    mutationFn: ({ pipelineId, stageId, data }) =>
      api.patch<Stage>(`/pipelines/${pipelineId}/stages/${stageId}`, data),
    onSuccess: (_s, { pipelineId }) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) });
      qc.invalidateQueries({ queryKey: pipelineKeys.list() });
    },
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; deleted: boolean },
    Error,
    { pipelineId: string; stageId: string }
  >({
    mutationFn: ({ pipelineId, stageId }) =>
      api.delete<{ id: string; deleted: boolean }>(`/pipelines/${pipelineId}/stages/${stageId}`),
    onSuccess: (_s, { pipelineId }) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) });
      qc.invalidateQueries({ queryKey: pipelineKeys.list() });
    },
  });
}
