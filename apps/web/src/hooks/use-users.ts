import { useQuery } from '@tanstack/react-query';
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
}

export function useUsers(filters: UserListFilters = {}) {
  const normalized = {
    search: filters.search?.trim() || undefined,
    limit: filters.limit ?? 100,
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
