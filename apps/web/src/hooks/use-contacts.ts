import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { Contact, PaginatedResult } from '@nexus/shared-types';
import type {
  CreateContactInput,
  UpdateContactInput,
} from '@nexus/validation';
import { api } from '@/lib/api-client';

/**
 * React Query hooks for the Contacts domain.
 *
 * The original hook exposed only a minimal reference-data lookup; this file
 * extends it with the full CRUD set so the `/contacts` page can drive the
 * table, slide-overs and delete confirmations directly from cache.
 */

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...contactKeys.lists(), f] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
};

export interface ContactListFilters {
  page?: number;
  limit?: number;
  search?: string;
  accountId?: string;
  ownerId?: string;
  sortBy?: 'firstName' | 'lastName' | 'email' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

type ContactListResponse = PaginatedResult<Contact>;

export function useContacts(filters: ContactListFilters = {}) {
  const normalized = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    search: filters.search?.trim() || undefined,
    accountId: filters.accountId,
    ownerId: filters.ownerId,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
  return useQuery<ContactListResponse>({
    queryKey: contactKeys.list(normalized),
    queryFn: () =>
      api.get<ContactListResponse>('/contacts', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useContact(id: string) {
  return useQuery<Contact>({
    queryKey: contactKeys.detail(id),
    queryFn: () => api.get<Contact>(`/contacts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation<Contact, Error, CreateContactInput>({
    mutationFn: (data) => api.post<Contact>('/contacts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation<
    Contact,
    Error,
    { id: string; data: UpdateContactInput }
  >({
    mutationFn: ({ id, data }) => api.patch<Contact>(`/contacts/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: contactKeys.detail(id) });
      qc.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  interface DelCtx {
    previous: Array<[QueryKey, ContactListResponse | undefined]>;
  }
  return useMutation<void, Error, string, DelCtx>({
    mutationFn: (id) => api.delete<void>(`/contacts/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: contactKeys.lists() });
      const previous = qc.getQueriesData<ContactListResponse>({
        queryKey: contactKeys.lists(),
      });
      qc.setQueriesData<ContactListResponse>(
        { queryKey: contactKeys.lists() },
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          return {
            ...old,
            data: old.data.filter((c) => c.id !== id),
            total: Math.max(0, (old.total ?? 1) - 1),
          };
        }
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => {
        if (data !== undefined) qc.setQueryData(key, data);
      });
    },
    onSettled: (_d, _e, id) => {
      qc.removeQueries({ queryKey: contactKeys.detail(id) });
      qc.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}
