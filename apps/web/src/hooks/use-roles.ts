import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@nexus/shared-types';
import { apiClients } from '@/lib/api-client';

export interface RoleRef {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  isSystem?: boolean;
}

export const roleKeys = {
  all: ['roles'] as const,
  lists: () => [...roleKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...roleKeys.lists(), filters] as const,
  detail: (id: string) => [...roleKeys.all, 'detail', id] as const,
  matrix: () => [...roleKeys.all, 'matrix'] as const,
};

export function useRoles(filters: { page?: number; limit?: number } = {}) {
  // auth caps list limit at 100 (>100 → 400); clamp so roles load.
  const normalized = { page: filters.page ?? 1, limit: Math.min(filters.limit ?? 100, 100) };
  return useQuery<PaginatedResult<RoleRef>>({
    queryKey: roleKeys.list(normalized),
    queryFn: () => apiClients.auth.get<PaginatedResult<RoleRef>>('/roles', { params: normalized }),
    staleTime: 60_000,
  });
}

export function useRolePermissionsMatrix() {
  return useQuery<{ permissions: string[]; builtInRolePermissions: Record<string, string[]> }>({
    queryKey: roleKeys.matrix(),
    queryFn: () => apiClients.auth.get('/roles/permissions/matrix'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation<RoleRef, Error, { name: string; description?: string; permissions: string[] }>({
    mutationFn: (data) => apiClients.auth.post<RoleRef>('/roles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.lists() }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation<RoleRef, Error, { id: string; data: Partial<{ name: string; description: string; permissions: string[] }> }>({
    mutationFn: ({ id, data }) => apiClients.auth.patch<RoleRef>(`/roles/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: roleKeys.lists() });
      qc.invalidateQueries({ queryKey: roleKeys.detail(id) });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) => apiClients.auth.delete<{ id: string }>(`/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.lists() }),
  });
}
