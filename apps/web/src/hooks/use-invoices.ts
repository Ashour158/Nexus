import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  PaginatedResult,
} from '@nexus/shared-types';
import type {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  RecordPaymentInput,
} from '@nexus/validation';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Finance/Invoices domain.
 */

export interface InvoiceLineItem {
  id?: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  total?: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  accountId: string;
  subscriptionId?: string | null;
  contractId?: string | null;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID' | 'UNCOLLECTIBLE';
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  paidAmount?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  lineItems: InvoiceLineItem[];
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  payments?: Payment[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  reference?: string | null;
  gateway?: string | null;
  gatewayRef?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface InvoiceListFilters {
  page?: number;
  limit?: number;
  accountId?: string;
  status?: Invoice['status'];
  fromDate?: string;
  toDate?: string;
  search?: string;
}

type InvoiceListResponse = PaginatedResult<Invoice>;

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...invoiceKeys.lists(), f] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
  payments: (id: string) => [...invoiceKeys.detail(id), 'payments'] as const,
};

export function useInvoices(filters: InvoiceListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    accountId: filters.accountId,
    status: filters.status,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    search: filters.search?.trim() || undefined,
  };
  return useQuery<InvoiceListResponse>({
    queryKey: invoiceKeys.list(normalized),
    queryFn: () => apiClients.finance.get<InvoiceListResponse>('/invoices', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useInvoice(id: string) {
  return useQuery<Invoice>({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => apiClients.finance.get<Invoice>(`/invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function useInvoicePayments(id: string) {
  return useQuery<Payment[]>({
    queryKey: invoiceKeys.payments(id),
    queryFn: () => apiClients.finance.get<Payment[]>(`/invoices/${id}/payments`),
    enabled: Boolean(id),
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation<Invoice, Error, CreateInvoiceInput>({
    mutationFn: (data) => apiClients.finance.post<Invoice>('/invoices', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      notify.success('Invoice created');
    },
    onError: (err) => {
      notify.error('Failed to create invoice', err.message);
    },
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation<Invoice, Error, { id: string; data: UpdateInvoiceInput }>({
    mutationFn: ({ id, data }) => apiClients.finance.patch<Invoice>(`/invoices/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      notify.success('Invoice updated');
    },
    onError: (err) => {
      notify.error('Failed to update invoice', err.message);
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation<Invoice, Error, string>({
    mutationFn: (id) => apiClients.finance.post<Invoice>(`/invoices/${id}/void`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      notify.success('Invoice voided');
    },
    onError: (err) => {
      notify.error('Failed to void invoice', err.message);
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation<Payment, Error, { id: string; data: RecordPaymentInput }>({
    mutationFn: ({ id, data }) => apiClients.finance.post<Payment>(`/invoices/${id}/payments`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: invoiceKeys.payments(id) });
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      notify.success('Payment recorded');
    },
    onError: (err) => {
      notify.error('Failed to record payment', err.message);
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.finance.delete<void>(`/invoices/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: invoiceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      notify.success('Invoice deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete invoice', err.message);
    },
  });
}
