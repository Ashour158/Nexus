import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  CpqPricingRequest,
  CpqPricingResult,
  PaginatedResult,
} from '@nexus/shared-types';
import type {
  CreateQuoteInput,
  UpdateQuoteInput,
} from '@nexus/validation';
import { apiClients } from '@/lib/api-client';

/**
 * React Query hooks for the Finance/Quotes domain.
 *
 * Targets the finance service (port 3002) via `apiClients.finance` because the
 * default `api` client is CRM-scoped. Deal-scoped quote lists are served by
 * the CRM service at `/deals/:id/quotes` — they share the same `Quote` shape.
 */

// ─── Public quote shape (matches finance Prisma `Quote` model) ──────────────

export interface QuoteLine {
  id: string;
  productId: string;
  productName?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice: string;
  listPrice?: string | null;
  discountPercent: string;
  taxPercent?: string | null;
  total: string;
  isFree?: boolean;
}

export interface Quote {
  id: string;
  tenantId: string;
  dealId: string;
  ownerId: string;
  accountId: string;
  quoteNumber: string;
  name: string;
  status:
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'SENT'
    | 'VIEWED'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'VOID'
    | 'CONVERTED';
  version: number;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  paymentTerms?: string | null;
  validUntil?: string | null;
  expiresAt?: string | null;
  sentAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  voidedAt?: string | null;
  rejectionReason?: string | null;
  voidReason?: string | null;
  approvalRequired: boolean;
  approvalStatus?: string | null;
  terms?: string | null;
  notes?: string | null;
  pricingBreakdown?: unknown;
  appliedPromos?: string[];
  lineItems?: QuoteLine[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteListFilters {
  page?: number;
  limit?: number;
  dealId?: string;
  accountId?: string;
  ownerId?: string;
  status?: Quote['status'];
  dateFrom?: string;
  dateTo?: string;
}

type QuoteListResponse = PaginatedResult<Quote>;

export const quoteKeys = {
  all: ['quotes'] as const,
  lists: () => [...quoteKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...quoteKeys.lists(), f] as const,
  details: () => [...quoteKeys.all, 'detail'] as const,
  detail: (id: string) => [...quoteKeys.details(), id] as const,
  forDeal: (dealId: string) => [...quoteKeys.all, 'deal', dealId] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

export function useQuotes(filters: QuoteListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    dealId: filters.dealId,
    accountId: filters.accountId,
    ownerId: filters.ownerId,
    status: filters.status,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
  return useQuery<QuoteListResponse>({
    queryKey: quoteKeys.list(normalized),
    queryFn: () =>
      apiClients.finance.get<QuoteListResponse>('/quotes', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useQuote(id: string) {
  return useQuery<Quote>({
    queryKey: quoteKeys.detail(id),
    queryFn: () => apiClients.finance.get<Quote>(`/quotes/${id}`),
    enabled: Boolean(id),
  });
}

/** Deal-scoped quote list. Served by the CRM service's `/deals/:id/quotes`. */
export function useDealQuotes(dealId: string) {
  return useQuery<QuoteListResponse>({
    queryKey: [...quoteKeys.forDeal(dealId)] as QueryKey,
    queryFn: () =>
      apiClients.crm.get<QuoteListResponse>(`/deals/${dealId}/quotes`),
    enabled: Boolean(dealId),
    staleTime: 15_000,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

interface CreateQuoteResponse {
  quote: Quote;
  pricing: unknown;
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, CreateQuoteInput>({
    mutationFn: async (data) => {
      const res = await apiClients.finance.post<CreateQuoteResponse>('/quotes', data);
      return res.quote;
    },
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
    },
  });
}

export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, { id: string; data: UpdateQuoteInput }>({
    mutationFn: ({ id, data }) =>
      apiClients.finance.patch<Quote>(`/quotes/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
    },
  });
}

export function useSendQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, string>({
    mutationFn: (id) => apiClients.finance.post<Quote>(`/quotes/${id}/send`),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quote.id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
    },
  });
}

export function useAcceptQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, string>({
    mutationFn: (id) => apiClients.finance.post<Quote>(`/quotes/${id}/accept`),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quote.id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
    },
  });
}

export function useRejectQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) =>
      apiClients.finance.post<Quote>(`/quotes/${id}/reject`, { reason }),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quote.id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
    },
  });
}

export function useVoidQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) =>
      apiClients.finance.post<Quote>(`/quotes/${id}/void`, { reason }),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quote.id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
    },
  });
}

export function useDuplicateQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, string>({
    mutationFn: (id) =>
      apiClients.finance.post<Quote>(`/quotes/${id}/duplicate`),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
    },
  });
}

export function useCpqPrice() {
  return useMutation<CpqPricingResult, Error, CpqPricingRequest>({
    mutationFn: (req) =>
      apiClients.finance.post<CpqPricingResult>('/cpq/price', req),
  });
}
