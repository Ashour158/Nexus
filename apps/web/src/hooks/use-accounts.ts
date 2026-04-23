import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type {
  Account,
  AccountHealthInsight,
  Contact,
  Deal,
  PaginatedResult,
  TimelineEvent,
} from '@nexus/shared-types';
import type {
  CreateAccountInput,
  UpdateAccountInput,
} from '@nexus/validation';
import { api } from '@/lib/api-client';

/**
 * React Query hooks for the Accounts domain — Prompt 1.10.
 *
 * Mirrors the pattern in Section 39.1 (`use-leads.ts`):
 *   - A typed `accountKeys` factory drives every cache entry.
 *   - List queries return `PaginatedResult<Account>`; the timeline uses
 *     `useInfiniteQuery` for cursor-style infinite scroll.
 *   - `useUpdateAccount` performs an optimistic detail-cache patch and rolls
 *     back on failure; `useDeleteAccount` removes the entry from the cache
 *     entirely.
 */

// ─── Filters / supporting types ─────────────────────────────────────────────

export interface AccountListFilters {
  page?: number;
  limit?: number;
  search?: string;
  ownerId?: string;
  type?: Account['type'];
  tier?: Account['tier'];
  status?: Account['status'];
  industry?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

interface DealsForAccountFilters {
  status?: Deal['status'];
  pipelineId?: string;
  limit?: number;
  page?: number;
}

interface ContactsForAccountFilters {
  search?: string;
  limit?: number;
  page?: number;
}

interface TimelineFilters {
  /** Page size for infinite-scroll fetches. Defaults to 20. */
  pageSize?: number;
  type?: TimelineEvent['type'];
}

// ─── Key factory ────────────────────────────────────────────────────────────

export const accountKeys = {
  all: ['accounts'] as const,
  lists: () => [...accountKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...accountKeys.lists(), filters] as const,
  details: () => [...accountKeys.all, 'detail'] as const,
  detail: (id: string) => [...accountKeys.details(), id] as const,
  timeline: (id: string, filters: Record<string, unknown> = {}) =>
    [...accountKeys.detail(id), 'timeline', filters] as const,
  deals: (id: string, filters: Record<string, unknown> = {}) =>
    [...accountKeys.detail(id), 'deals', filters] as const,
  contacts: (id: string, filters: Record<string, unknown> = {}) =>
    [...accountKeys.detail(id), 'contacts', filters] as const,
  health: (id: string) => [...accountKeys.detail(id), 'health'] as const,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Drops `undefined` / empty-string filter entries before they hit the URL. */
function normalizeFilters<T extends Record<string, unknown>>(
  filters: T
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** Paginated list of accounts with optional filters (Section 34.2). */
export function useAccounts(filters: AccountListFilters = {}) {
  const params = normalizeFilters({
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    search: filters.search,
    ownerId: filters.ownerId,
    type: filters.type,
    tier: filters.tier,
    status: filters.status,
    industry: filters.industry,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  });
  return useQuery<PaginatedResult<Account>>({
    queryKey: accountKeys.list(params),
    queryFn: () =>
      api.get<PaginatedResult<Account>>('/accounts', { params }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Single account by id (Section 34.2 `GET /accounts/:id`). */
export function useAccount(id: string) {
  return useQuery<Account>({
    queryKey: accountKeys.detail(id),
    queryFn: () => api.get<Account>(`/accounts/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Infinite-scroll timeline for an account (`GET /accounts/:id/timeline`).
 * Each page returns `PaginatedResult<TimelineEvent>`; `getNextPageParam`
 * advances by `page + 1` while `hasNextPage` is true.
 */
export function useAccountTimeline(
  id: string,
  filters: TimelineFilters = {}
) {
  const limit = filters.pageSize ?? 20;
  const baseParams = normalizeFilters({ type: filters.type });
  return useInfiniteQuery<
    PaginatedResult<TimelineEvent>,
    Error,
    InfiniteData<PaginatedResult<TimelineEvent>>,
    ReturnType<typeof accountKeys.timeline>,
    number
  >({
    queryKey: accountKeys.timeline(id, { ...baseParams, limit }),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResult<TimelineEvent>>(`/accounts/${id}/timeline`, {
        params: { ...baseParams, page: pageParam, limit },
      }),
    getNextPageParam: (last) =>
      last.hasNextPage ? last.page + 1 : undefined,
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/** Deals belonging to an account, filterable by status / pipeline. */
export function useAccountDeals(
  id: string,
  filters: DealsForAccountFilters = {}
) {
  const params = normalizeFilters({
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
    status: filters.status,
    pipelineId: filters.pipelineId,
  });
  return useQuery<PaginatedResult<Deal>>({
    queryKey: accountKeys.deals(id, params),
    queryFn: () =>
      api.get<PaginatedResult<Deal>>(`/accounts/${id}/deals`, { params }),
    enabled: Boolean(id),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Contacts belonging to an account, with an optional search term. */
export function useAccountContacts(
  id: string,
  filters: ContactsForAccountFilters = {}
) {
  const params = normalizeFilters({
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
    search: filters.search,
  });
  return useQuery<PaginatedResult<Contact>>({
    queryKey: accountKeys.contacts(id, params),
    queryFn: () =>
      api.get<PaginatedResult<Contact>>(`/accounts/${id}/contacts`, {
        params,
      }),
    enabled: Boolean(id),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Composite account health snapshot (Section 32 / 34.2). */
export function useAccountHealth(id: string) {
  return useQuery<AccountHealthInsight>({
    queryKey: accountKeys.health(id),
    queryFn: () =>
      api.get<AccountHealthInsight>(`/accounts/${id}/health`),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation<Account, Error, CreateAccountInput>({
    mutationFn: (data) => api.post<Account>('/accounts', data),
    onSuccess: (account) => {
      qc.setQueryData(accountKeys.detail(account.id), account);
      qc.invalidateQueries({ queryKey: accountKeys.lists() });
    },
  });
}

interface UpdateAccountVars {
  id: string;
  data: UpdateAccountInput;
}
interface UpdateAccountContext {
  previous: Account | undefined;
}

/**
 * Optimistic account update — patches the detail cache immediately, rolls
 * back on error, and refreshes detail + lists once settled.
 */
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation<Account, Error, UpdateAccountVars, UpdateAccountContext>({
    mutationFn: ({ id, data }) => api.patch<Account>(`/accounts/${id}`, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: accountKeys.detail(id) });
      const previous = qc.getQueryData<Account>(accountKeys.detail(id));
      if (previous) {
        qc.setQueryData<Account>(accountKeys.detail(id), {
          ...previous,
          ...(data as Partial<Account>),
        });
      }
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(accountKeys.detail(id), ctx.previous);
      }
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) });
      qc.invalidateQueries({ queryKey: accountKeys.lists() });
    },
  });
}

/**
 * Deletes an account and prunes every cache entry related to it (detail,
 * timeline, deals, contacts, health) before re-fetching the list.
 */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete<void>(`/accounts/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: accountKeys.detail(id) });
      qc.invalidateQueries({ queryKey: accountKeys.lists() });
    },
  });
}
