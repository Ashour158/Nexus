import { useQuery } from '@tanstack/react-query';
import type { Contact, PaginatedResult } from '@nexus/shared-types';
import { api } from '@/lib/api-client';

/**
 * Thin contacts reference-data hook for multi-select controls. The full
 * contact hook-set (detail, mutations, timeline) lives in a later prompt.
 */

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...contactKeys.lists(), filters] as const,
};

export interface ContactListFilters {
  search?: string;
  accountId?: string;
  limit?: number;
}

export function useContacts(filters: ContactListFilters = {}) {
  const normalized = {
    search: filters.search?.trim() || undefined,
    accountId: filters.accountId,
    limit: filters.limit ?? 100,
  };
  return useQuery<PaginatedResult<Contact>>({
    queryKey: contactKeys.list(normalized),
    queryFn: () =>
      api.get<PaginatedResult<Contact>>('/contacts', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
