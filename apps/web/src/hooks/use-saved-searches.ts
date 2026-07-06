'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

/**
 * React Query hooks for saved searches (SRCH-08) and recent searches (SRCH-09).
 * These talk to the web BFF routes under /api/search/* which auth-forward to
 * search-service. Everything is tenant + user scoped server-side from the JWT.
 */

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  entityType?: string | null;
  filters?: Record<string, unknown> | null;
  createdAt: string;
}

export interface RecentSearch {
  id: string;
  query: string;
  entityType?: string | null;
  searchedAt: string;
}

export interface CreateSavedSearchInput {
  name: string;
  query: string;
  entityType?: string;
  filters?: Record<string, unknown>;
}

function authHeaders(json = false): Record<string, string> {
  const token = useAuthStore.getState().accessToken ?? '';
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function unwrap<T>(res: Response, fallback: T): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { data?: T };
  return body.data ?? fallback;
}

export const savedSearchKeys = {
  saved: ['search', 'saved'] as const,
  recent: ['search', 'recent'] as const,
};

export function useSavedSearches() {
  return useQuery<SavedSearch[]>({
    queryKey: savedSearchKeys.saved,
    queryFn: async () => {
      const res = await fetch('/api/search/saved', { headers: authHeaders() });
      return unwrap<SavedSearch[]>(res, []);
    },
    staleTime: 60_000,
  });
}

export function useRecentSearches(limit = 10, enabled = true) {
  return useQuery<RecentSearch[]>({
    queryKey: [...savedSearchKeys.recent, limit] as const,
    queryFn: async () => {
      const res = await fetch(`/api/search/recent?limit=${limit}`, { headers: authHeaders() });
      return unwrap<RecentSearch[]>(res, []);
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useCreateSavedSearch() {
  const qc = useQueryClient();
  return useMutation<SavedSearch, Error, CreateSavedSearchInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/search/saved', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to save search');
      return unwrap<SavedSearch>(res, {} as SavedSearch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savedSearchKeys.saved });
    },
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/search/saved/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete saved search');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savedSearchKeys.saved });
    },
  });
}
