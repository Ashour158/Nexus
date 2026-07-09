import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@nexus/shared-types';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKey {
  key: string;
}

export const apiKeyKeys = {
  all: ['api-keys'] as const,
  list: () => [...apiKeyKeys.all, 'list'] as const,
};

export function useApiKeys() {
  return useQuery<PaginatedResult<ApiKey>>({
    queryKey: apiKeyKeys.list(),
    queryFn: () =>
      apiClients.auth.get<PaginatedResult<ApiKey>>('/api-keys', {
        params: { limit: 100 },
      }),
    staleTime: 30_000,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation<
    CreatedApiKey,
    Error,
    { name: string; scopes?: string[]; expiresAt?: string }
  >({
    mutationFn: (data) =>
      apiClients.auth.post<CreatedApiKey>('/api-keys', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeyKeys.all });
      notify.success('API key created');
    },
    onError: (err) => {
      notify.error('Failed to create API key', err.message);
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) =>
      apiClients.auth.delete<{ id: string }>(`/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeyKeys.all });
      notify.success('API key revoked');
    },
    onError: (err) => {
      notify.error('Failed to revoke API key', err.message);
    },
  });
}
