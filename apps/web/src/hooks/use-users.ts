import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@nexus/shared-types';
import { apiClients } from '@/lib/api-client';

/**
 * User reference-data hook for owner/assignee selectors. Targets the auth
 * service (Section 34.1 `GET /users`) — hence the use of `apiClients.auth`
 * rather than the default CRM client.
 */

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  roles?: Array<{ id: string; name: string }>;
  phone?: string | null;
  timezone?: string | null;
  language?: string | null;
  lastLoginAt?: string | null;
}

export interface RoleRef {
  id: string;
  name: string;
  isSystem?: boolean;
}

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...userKeys.lists(), filters] as const,
};

export interface UserListFilters {
  search?: string;
  limit?: number;
  page?: number;
  isActive?: boolean;
  roleId?: string;
}

export function useUsers(filters: UserListFilters = {}) {
  const normalized = {
    search: filters.search?.trim() || undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 100,
    isActive: filters.isActive,
    roleId: filters.roleId,
  };
  return useQuery<PaginatedResult<UserRef>>({
    queryKey: userKeys.list(normalized),
    queryFn: () =>
      apiClients.auth.get<PaginatedResult<UserRef>>('/users', {
        params: normalized,
      }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useRoles() {
  return useQuery<PaginatedResult<RoleRef>>({
    queryKey: [...userKeys.all, 'roles'],
    queryFn: () => apiClients.auth.get<PaginatedResult<RoleRef>>('/roles', { params: { limit: 200 } }),
    staleTime: 5 * 60_000,
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation<
    UserRef,
    Error,
    { email: string; firstName: string; lastName: string; roleIds: string[]; sendEmail?: boolean }
  >({
    mutationFn: (data) => apiClients.auth.post<UserRef>('/users/invite', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation<
    UserRef,
    Error,
    { id: string; data: Partial<{ firstName: string; lastName: string; phone: string; timezone: string; language: string; isActive: boolean }> }
  >({
    mutationFn: ({ id, data }) => apiClients.auth.patch<UserRef>(`/users/${id}`, data),
    onSuccess: (_u, { id }) => {
      qc.invalidateQueries({ queryKey: userKeys.all });
      qc.invalidateQueries({ queryKey: [...userKeys.all, 'detail', id] });
    },
  });
}

export function useAssignUserRoles() {
  const qc = useQueryClient();
  return useMutation<UserRef, Error, { id: string; roleIds: string[] }>({
    mutationFn: ({ id, roleIds }) =>
      apiClients.auth.patch<UserRef>(`/users/${id}/roles`, { roleIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation<{ id: string; deactivated: boolean }, Error, string>({
    mutationFn: (id) => apiClients.auth.delete<{ id: string; deactivated: boolean }>(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}
