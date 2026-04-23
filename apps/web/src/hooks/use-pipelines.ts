import { useQuery } from '@tanstack/react-query';
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
