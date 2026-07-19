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
  CreateDiscountRequestInput,
  UpdateQuoteInput,
} from '@nexus/validation';
import { api, apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

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
  discountAmount?: string | null;
  taxPercent?: string | null;
  total: string;
  isFree?: boolean;
}

export interface QuoteRevision {
  id: string;
  quoteId: string;
  version: number;
  reason: string;
  status: Quote['status'];
  snapshot: Record<string, unknown>;
  createdById?: string | null;
  createdAt: string;
}

export interface QuoteTemplate {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  language: string;
  isDefault: boolean;
  isActive: boolean;
  body?: string | null;
}

export interface QuoteDocument {
  id: string;
  quoteId: string;
  templateId?: string | null;
  format: 'HTML' | 'PDF' | 'DOCX';
  status: 'QUEUED' | 'RENDERED' | 'FAILED' | 'ARCHIVED';
  fileName: string;
  contentType: string;
  storageKey?: string | null;
  renderedHtml?: string | null;
  contentBase64?: string | null;
  contentSize?: number | null;
  checksum?: string | null;
  createdAt: string;
}

export interface QuoteESignEnvelope {
  id: string;
  quoteId: string;
  documentId?: string | null;
  provider: string;
  providerEnvelopeId?: string | null;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED' | 'VOIDED' | 'EXPIRED';
  recipientName: string;
  recipientEmail: string;
  sentById: string;
  sentAt?: string | null;
  signedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface Quote {
  id: string;
  tenantId: string;
  dealId: string;
  ownerId: string;
  accountId: string;
  contactId?: string | null;
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
  discountAmount?: string;
  discountTotal: string;
  taxAmount?: string;
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

export interface DiscountRequest {
  id: string;
  tenantId: string;
  quoteId: string;
  requestedById: string;
  approvalRequestId?: string | null;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  reasonCode: string;
  reasonLabel: string;
  reasonNotes?: string | null;
  currentDiscountPercent: string;
  requestedDiscountPercent: string;
  requestedDiscountAmount: string;
  winningProbabilityIfApproved: number;
  businessImpact?: string | null;
  competitorName?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountReason {
  code: string;
  label: string;
}

export interface QuoteListFilters {
  page?: number;
  limit?: number;
  dealId?: string;
  accountId?: string;
  contactId?: string;
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
  discountRequests: (quoteId: string) => [...quoteKeys.all, 'discount-requests', quoteId] as const,
  discountReasons: () => [...quoteKeys.all, 'discount-reasons'] as const,
  revisions: (quoteId: string) => [...quoteKeys.all, 'revisions', quoteId] as const,
  templates: () => [...quoteKeys.all, 'templates'] as const,
  documents: (quoteId: string) => [...quoteKeys.all, 'documents', quoteId] as const,
  esign: (quoteId: string) => [...quoteKeys.all, 'esign', quoteId] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

export function useQuotes(filters: QuoteListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    dealId: filters.dealId,
    accountId: filters.accountId,
    contactId: filters.contactId,
    ownerId: filters.ownerId,
    status: filters.status,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
  return useQuery<QuoteListResponse>({
    queryKey: quoteKeys.list(normalized),
    queryFn: () =>
      apiClients.quotes.get<QuoteListResponse>('/quotes', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useQuote(id: string) {
  return useQuery<Quote>({
    queryKey: quoteKeys.detail(id),
    queryFn: () => getRelative<Quote>(`/api/quotes/${id}`),
    enabled: Boolean(id),
  });
}

/** Deal-scoped quote list. Served by the CRM service's `/deals/:id/quotes`. */
export function useDealQuotes(dealId: string) {
  return useQuery<QuoteListResponse>({
    queryKey: [...quoteKeys.forDeal(dealId)] as QueryKey,
    queryFn: () =>
      api.get<QuoteListResponse>(`/deals/${dealId}/quotes`),
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
      const res = await apiClients.quotes.post<CreateQuoteResponse>('/quotes', data);
      return res.quote;
    },
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
      notify.success('Quote created');
    },
    onError: (err) => {
      notify.error('Failed to create quote', err.message);
    },
  });
}

export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, { id: string; data: UpdateQuoteInput }>({
    mutationFn: ({ id, data }) =>
      apiClients.quotes.patch<Quote>(`/quotes/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      notify.success('Quote updated');
    },
    onError: (err) => {
      notify.error('Failed to update quote', err.message);
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
      notify.success('Quote sent');
    },
    onError: (err) => {
      notify.error('Failed to send quote', err.message);
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
      notify.success('Quote accepted');
    },
    onError: (err) => {
      notify.error('Failed to accept quote', err.message);
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
      notify.success('Quote rejected');
    },
    onError: (err) => {
      notify.error('Failed to reject quote', err.message);
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
      notify.success('Quote voided');
    },
    onError: (err) => {
      notify.error('Failed to void quote', err.message);
    },
  });
}

/** Level-aware manager approval: advances a PENDING_APPROVAL quote one level. */
export function useApproveQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, string>({
    mutationFn: (id) => apiClients.finance.post<Quote>(`/quotes/${id}/approve`),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quote.id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.forDeal(quote.dealId) });
      notify.success(quote.status === 'APPROVED' ? 'Quote fully approved' : 'Approval level recorded');
    },
    onError: (err) => {
      notify.error('Failed to approve quote', err.message);
    },
  });
}

/** Archived (soft-deleted) quotes list. */
export function useArchivedQuotes(filters: QuoteListFilters = {}, options: { enabled?: boolean } = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    ownerId: filters.ownerId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
  return useQuery<QuoteListResponse>({
    queryKey: [...quoteKeys.lists(), 'archived', normalized] as QueryKey,
    queryFn: () => apiClients.quotes.get<QuoteListResponse>('/quotes/archived', { params: normalized }),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Restore (un-archive) a quote. */
export function useRestoreQuote() {
  const qc = useQueryClient();
  return useMutation<Quote, Error, string>({
    mutationFn: (id) => apiClients.finance.post<Quote>(`/quotes/${id}/restore`),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quote.id) });
      notify.success('Quote restored');
    },
    onError: (err) => {
      notify.error('Failed to restore quote', err.message);
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
      notify.success('Quote duplicated');
    },
    onError: (err) => {
      notify.error('Failed to duplicate quote', err.message);
    },
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.quotes.delete<void>(`/quotes/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: quoteKeys.detail(id) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      notify.success('Quote deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete quote', err.message);
    },
  });
}

async function getRelative<T>(url: string): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = (await res.json()) as { success?: boolean; data?: T; error?: { message?: string } };
  if (!res.ok || !body.success || body.data === undefined) throw new Error(body.error?.message ?? 'Request failed');
  return body.data;
}

async function postRelative<T>(url: string, payload?: unknown): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload ?? {}),
  });
  const body = (await res.json()) as { success?: boolean; data?: T; error?: { message?: string } };
  if (!res.ok || !body.success || body.data === undefined) throw new Error(body.error?.message ?? 'Request failed');
  return body.data;
}

export function useQuoteRevisions(quoteId: string) {
  return useQuery<QuoteRevision[]>({
    queryKey: quoteKeys.revisions(quoteId),
    queryFn: () => getRelative<QuoteRevision[]>(`/api/quotes/${quoteId}/revisions`),
    enabled: Boolean(quoteId),
  });
}

export function useQuoteTemplates(options: { enabled?: boolean } = {}) {
  return useQuery<QuoteTemplate[]>({
    queryKey: quoteKeys.templates(),
    queryFn: () => getRelative<QuoteTemplate[]>('/api/finance/quote-templates'),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useQuoteDocuments(quoteId: string) {
  return useQuery<QuoteDocument[]>({
    queryKey: quoteKeys.documents(quoteId),
    queryFn: () => getRelative<QuoteDocument[]>(`/api/quotes/${quoteId}/documents`),
    enabled: Boolean(quoteId),
  });
}

export function useRenderQuoteDocument() {
  const qc = useQueryClient();
  return useMutation<QuoteDocument, Error, { quoteId: string; templateId?: string; format: 'HTML' | 'PDF' | 'DOCX' }>({
    mutationFn: ({ quoteId, ...payload }) => postRelative<QuoteDocument>(`/api/quotes/${quoteId}/render`, payload),
    onSuccess: (document) => {
      qc.invalidateQueries({ queryKey: quoteKeys.documents(document.quoteId) });
      notify.success('Quote document rendered');
    },
    onError: (err) => notify.error('Render failed', err.message),
  });
}

export function useQuoteESignEnvelopes(quoteId: string) {
  return useQuery<QuoteESignEnvelope[]>({
    queryKey: quoteKeys.esign(quoteId),
    queryFn: () => getRelative<QuoteESignEnvelope[]>(`/api/quotes/${quoteId}/esign`),
    enabled: Boolean(quoteId),
  });
}

export function useSendQuoteForSignature() {
  const qc = useQueryClient();
  return useMutation<QuoteESignEnvelope, Error, { quoteId: string; documentId?: string; recipientName: string; recipientEmail: string; expiresAt?: string }>({
    mutationFn: ({ quoteId, ...payload }) => postRelative<QuoteESignEnvelope>(`/api/quotes/${quoteId}/esign/send`, payload),
    onSuccess: (envelope) => {
      qc.invalidateQueries({ queryKey: quoteKeys.esign(envelope.quoteId) });
      notify.success('Signature envelope sent');
    },
    onError: (err) => notify.error('Signature send failed', err.message),
  });
}

export function useConvertQuoteToOrder() {
  const qc = useQueryClient();
  return useMutation<{ id: string; quoteId: string }, Error, string>({
    mutationFn: (quoteId) => postRelative<{ id: string; quoteId: string }>(`/api/quotes/${quoteId}/convert-order`),
    onSuccess: (order, quoteId) => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      notify.success(`Converted to order ${order.id}`);
    },
    onError: (err) => notify.error('Order conversion failed', err.message),
  });
}

export function useCpqPrice() {
  return useMutation<CpqPricingResult, Error, CpqPricingRequest>({
    mutationFn: (req) =>
      apiClients.finance.post<CpqPricingResult>('/cpq/price', req),
    onError: (err) => {
      notify.error('Failed to calculate pricing', err.message);
    },
  });
}

export function useDiscountRequests(quoteId: string) {
  return useQuery<PaginatedResult<DiscountRequest>>({
    queryKey: quoteKeys.discountRequests(quoteId),
    queryFn: async () => {
      const res = await fetch(`/api/finance/discount-requests?quoteId=${encodeURIComponent(quoteId)}&limit=25`, {
        cache: 'no-store',
      });
      const body = (await res.json()) as { success?: boolean; data?: PaginatedResult<DiscountRequest>; error?: { message?: string } };
      if (!res.ok || !body.success || !body.data) throw new Error(body.error?.message ?? 'Failed to load discount requests');
      return body.data;
    },
    enabled: Boolean(quoteId),
    staleTime: 15_000,
  });
}

export function useDiscountReasons() {
  return useQuery<DiscountReason[]>({
    queryKey: quoteKeys.discountReasons(),
    queryFn: async () => {
      const res = await fetch('/api/finance/discount-requests/reasons', { cache: 'no-store' });
      const body = (await res.json()) as { success?: boolean; data?: DiscountReason[]; error?: { message?: string } };
      if (!res.ok || !body.success || !body.data) throw new Error(body.error?.message ?? 'Failed to load discount reasons');
      return body.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateDiscountRequest() {
  const qc = useQueryClient();
  return useMutation<DiscountRequest, Error, CreateDiscountRequestInput>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/finance/discount-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { success?: boolean; data?: DiscountRequest; error?: { message?: string } };
      if (!res.ok || !body.success || !body.data) throw new Error(body.error?.message ?? 'Failed to create discount request');
      return body.data;
    },
    onSuccess: (request) => {
      qc.invalidateQueries({ queryKey: quoteKeys.discountRequests(request.quoteId) });
      qc.invalidateQueries({ queryKey: quoteKeys.detail(request.quoteId) });
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      notify.success('Discount request submitted');
    },
    onError: (err) => {
      notify.error('Failed to submit discount request', err.message);
    },
  });
}
