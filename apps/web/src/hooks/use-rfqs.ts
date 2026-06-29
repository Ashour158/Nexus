import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

/**
 * React Query hooks for the Finance/RFQ domain.
 */

export interface RFQLineItem {
  id?: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface RFQ {
  id: string;
  tenantId: string;
  rfqNumber: string;
  title: string;
  status: string;
  currency: string;
  accountId?: string | null;
  contactId?: string | null;
  ownerId: string;
  requiredByDate?: string | null;
  lineItems?: RFQLineItem[];
  internalNotes?: string | null;
  convertedQuoteId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RFQListFilters {
  search?: string;
  status?: string;
}

export const rfqKeys = {
  all: ['rfqs'] as const,
  lists: () => [...rfqKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...rfqKeys.lists(), f] as const,
  details: () => [...rfqKeys.all, 'detail'] as const,
  detail: (id: string) => [...rfqKeys.details(), id] as const,
};

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function withQuery(path: string, params?: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

async function getRfqRelative<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(withQuery(`/api/finance${path}`, params), {
    cache: 'no-store',
    headers: authHeaders(),
  });
  const body = (await res.json()) as { success?: boolean; data?: T; error?: { message?: string } };
  if (!res.ok || !body.success || body.data === undefined) throw new Error(body.error?.message ?? 'Request failed');
  return body.data;
}

async function postRfqRelative<T>(path: string, payload?: unknown): Promise<T> {
  const res = await fetch(`/api/finance${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  });
  const body = (await res.json()) as { success?: boolean; data?: T; error?: { message?: string } };
  if (!res.ok || !body.success || body.data === undefined) throw new Error(body.error?.message ?? 'Request failed');
  return body.data;
}

export function useRFQs(filters: RFQListFilters = {}) {
  const normalized: Record<string, unknown> = {
    search: filters.search?.trim() || undefined,
    status: filters.status,
  };
  return useQuery<RFQ[]>({
    queryKey: rfqKeys.list(normalized),
    queryFn: async () => {
      const result = await getRfqRelative<RFQ[] | { data?: RFQ[] }>('/rfqs', normalized);
      return Array.isArray(result) ? result : result.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useRFQ(id: string) {
  return useQuery<RFQ>({
    queryKey: rfqKeys.detail(id),
    queryFn: () => getRfqRelative<RFQ>(`/rfqs/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateRFQ() {
  const qc = useQueryClient();
  return useMutation<RFQ, Error, { title: string; accountId?: string; contactId?: string; currency?: string }>({
    mutationFn: (data) => postRfqRelative<RFQ>('/rfqs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rfqKeys.lists() });
      notify.success('RFQ created');
    },
    onError: (err) => {
      notify.error('Failed to create RFQ', err.message);
    },
  });
}

export function useUpdateRFQ() {
  const qc = useQueryClient();
  return useMutation<RFQ, Error, { id: string; data: Partial<RFQ> }>({
    mutationFn: ({ id, data }) => apiClients.finance.patch<RFQ>(`/rfqs/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: rfqKeys.detail(id) });
      qc.invalidateQueries({ queryKey: rfqKeys.lists() });
      notify.success('RFQ updated');
    },
    onError: (err) => {
      notify.error('Failed to update RFQ', err.message);
    },
  });
}

export function useDeleteRFQ() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.finance.delete<void>(`/rfqs/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: rfqKeys.detail(id) });
      qc.invalidateQueries({ queryKey: rfqKeys.lists() });
      notify.success('RFQ deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete RFQ', err.message);
    },
  });
}

export function useSendRFQ() {
  const qc = useQueryClient();
  return useMutation<RFQ, Error, string>({
    mutationFn: (id) => postRfqRelative<RFQ>(`/rfqs/${id}/send`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: rfqKeys.detail(id) });
      qc.invalidateQueries({ queryKey: rfqKeys.lists() });
      notify.success('RFQ sent');
    },
    onError: (err) => {
      notify.error('Failed to send RFQ', err.message);
    },
  });
}

export interface ConvertRFQResult {
  rfqId: string;
  quoteId: string;
}

export function useConvertRFQToQuote() {
  const qc = useQueryClient();
  return useMutation<ConvertRFQResult, Error, string>({
    mutationFn: (id) => postRfqRelative<ConvertRFQResult>(`/rfqs/${id}/convert`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rfqKeys.lists() });
      notify.success('RFQ converted to quote');
    },
    onError: (err) => {
      notify.error('Failed to convert RFQ', err.message);
    },
  });
}
