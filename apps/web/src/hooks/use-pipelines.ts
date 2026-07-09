import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pipeline, Stage } from '@nexus/shared-types';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Pipeline and stage hooks — calls Next.js BFF at `/api/crm/pipelines/*`
 * (authorization + tenant forwarded to crm-service).
 */

export const pipelineKeys = {
  all: ['pipelines'] as const,
  list: () => [...pipelineKeys.all, 'list'] as const,
  detail: (id: string) => [...pipelineKeys.all, 'detail', id] as const,
  stages: (pipelineId: string) => [...pipelineKeys.detail(pipelineId), 'stages'] as const,
};

function useHeaders(): Record<string, string> {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    'x-tenant-id': tenantId ?? 'default',
    'Content-Type': 'application/json',
  };
}

async function apiFetchJson<T extends { success?: boolean; data?: unknown; error?: unknown }>(
  url: string,
  init: RequestInit,
  base: Record<string, string>
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...base, ...(init.headers as Record<string, string>) },
  });
  const body = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const err = body as { error?: unknown };
    const msg =
      typeof err?.error === 'string'
        ? err.error
        : err?.error &&
            typeof err.error === 'object' &&
            err.error !== null &&
            'message' in err.error
          ? String((err.error as { message: unknown }).message)
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

export function usePipelines() {
  const h = useHeaders();
  return useQuery<Pipeline[]>({
    queryKey: pipelineKeys.list(),
    queryFn: async () => {
      const r = await apiFetchJson<{ success: boolean; data: Pipeline[] }>('/api/crm/pipelines', { method: 'GET' }, h);
      return r.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useStages(pipelineId: string | null | undefined) {
  const h = useHeaders();
  return useQuery<Stage[]>({
    queryKey: pipelineKeys.stages(pipelineId ?? ''),
    queryFn: async () => {
      const r = await apiFetchJson<{ success: boolean; data: Stage[] }>(
        `/api/crm/pipelines/${pipelineId as string}/stages`,
        { method: 'GET' },
        h
      );
      return r.data ?? [];
    },
    enabled: Boolean(pipelineId),
    staleTime: 5 * 60_000,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<
    Pipeline,
    Error,
    { name: string; currency: string }
  >({
    mutationFn: async (data) => {
      const body = {
        name: data.name,
        currency: data.currency || 'USD',
        stages: [
          {
            name: 'New',
            order: 1,
            probability: 10,
            rottenDays: 30,
            color: '#6B7280',
          },
        ],
      };
      const r = await apiFetchJson<{ success: boolean; data: Pipeline }>(
        '/api/crm/pipelines',
        { method: 'POST', body: JSON.stringify(body) },
        h
      );
      if (!r.data) throw new Error('No pipeline returned');
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineKeys.list() }),
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<
    Pipeline,
    Error,
    {
      id: string;
      data: Partial<{ name: string; currency: string; isDefault: boolean; isActive: boolean }>;
    }
  >({
    mutationFn: async ({ id, data }) => {
      const r = await apiFetchJson<{ success: boolean; data: Pipeline }>(
        `/api/crm/pipelines/${id}`,
        { method: 'PATCH', body: JSON.stringify(data) },
        h
      );
      if (!r.data) throw new Error('No pipeline returned');
      return r.data;
    },
    onSuccess: (_r, { id }) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.list() });
      qc.invalidateQueries({ queryKey: pipelineKeys.detail(id) });
    },
  });
}

export function useArchivePipeline() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<void, Error, string | { id: string; moveTo?: string }>({
    mutationFn: async (vars) => {
      const { id, moveTo } = typeof vars === 'string' ? { id: vars, moveTo: undefined } : vars;
      const qs = moveTo ? `?moveTo=${moveTo}` : '';
      await apiFetchJson<{ success: boolean }>(
        `/api/crm/pipelines/${id}${qs}`,
        { method: 'DELETE' },
        h
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineKeys.list() }),
  });
}

export function useSetDefaultPipeline() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiFetchJson<{ success: boolean }>(
        `/api/crm/pipelines/${id}/set-default`,
        { method: 'POST' },
        h
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineKeys.list() }),
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<
    Stage,
    Error,
    | { pipelineId: string; data: { name: string; order?: number; probability?: number; rottenDays?: number; color?: string } }
    | { pipelineId: string; name: string; order?: number; probability?: number; rottenDays?: number; color?: string }
  >({
    mutationFn: async (vars) => {
      const pipelineId = vars.pipelineId;
      const data =
        'data' in vars
          ? vars.data
          : {
              name: vars.name,
              order: vars.order,
              probability: vars.probability,
              rottenDays: vars.rottenDays,
              color: vars.color,
            };
      const r = await apiFetchJson<{ success: boolean; data: Stage }>(
        `/api/crm/pipelines/${pipelineId}/stages`,
        { method: 'POST', body: JSON.stringify(data) },
        h
      );
      if (!r.data) throw new Error('No stage returned');
      return r.data;
    },
    onSuccess: (_r, { pipelineId }) =>
      qc.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) }),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<
    Stage,
    Error,
    {
      pipelineId: string;
      stageId: string;
      data: Partial<{ name: string; probability: number; rottenDays: number; color: string; order: number }>;
    }
  >({
    mutationFn: async ({ pipelineId, stageId, data }) => {
      const r = await apiFetchJson<{ success: boolean; data: Stage }>(
        `/api/crm/pipelines/${pipelineId}/stages/${stageId}`,
        { method: 'PATCH', body: JSON.stringify(data) },
        h
      );
      if (!r.data) throw new Error('No stage returned');
      return r.data;
    },
    onSuccess: (_r, { pipelineId }) =>
      qc.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) }),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<void, Error, { pipelineId: string; stageId: string; moveTo?: string }>({
    mutationFn: async ({ pipelineId, stageId, moveTo }) => {
      const qs = moveTo ? `?moveTo=${moveTo}` : '';
      await apiFetchJson<{ success: boolean }>(
        `/api/crm/pipelines/${pipelineId}/stages/${stageId}${qs}`,
        { method: 'DELETE' },
        h
      );
    },
    onSuccess: (_r, { pipelineId }) =>
      qc.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) }),
  });
}
