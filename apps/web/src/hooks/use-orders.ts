import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@nexus/shared-types';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { invoiceKeys, type Invoice } from '@/hooks/use-invoices';

/**
 * React Query hooks for the Sales Orders domain — finance-service.
 *
 * Mirrors `use-invoices`: delegates to `apiClients.finance` (base →
 * finance-service `/api/v1`, direct in dev like the invoices page). The client
 * unwraps `{ success, data }`, so the list endpoint hands back a
 * PaginatedResult and detail hands back the order row.
 *
 * The commercial chain terminus is `POST /orders/:id/invoice`, which materializes
 * an Invoice from a confirmed order (totals derived server-side — the body only
 * carries optional invoicing metadata).
 */

export type SalesOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'FULFILLING'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'CLOSED';

export const ORDER_STATUSES: SalesOrderStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'CONFIRMED',
  'FULFILLING',
  'FULFILLED',
  'CANCELLED',
  'CLOSED',
];

export interface OrderLineItem {
  id?: string;
  productId?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
  [key: string]: unknown;
}

export interface SalesOrder {
  id: string;
  tenantId: string;
  accountId: string;
  contactId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  ownerId: string;
  orderNumber: string;
  name: string;
  status: SalesOrderStatus;
  currency: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  orderedAt?: string | null;
  expectedFulfillmentAt?: string | null;
  fulfilledAt?: string | null;
  cancelledAt?: string | null;
  lineItems: OrderLineItem[];
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListFilters {
  page?: number;
  limit?: number;
  accountId?: string;
  contactId?: string;
  dealId?: string;
  quoteId?: string;
  status?: SalesOrderStatus;
  sortDir?: 'asc' | 'desc';
}

export interface CreateInvoiceFromOrderInput {
  dueDate?: string;
  notes?: string;
}

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...orderKeys.lists(), f] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};

export function useOrders(filters: OrderListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    accountId: filters.accountId || undefined,
    contactId: filters.contactId || undefined,
    dealId: filters.dealId || undefined,
    quoteId: filters.quoteId || undefined,
    status: filters.status || undefined,
    sortDir: filters.sortDir ?? 'desc',
  };
  return useQuery<PaginatedResult<SalesOrder>>({
    queryKey: orderKeys.list(normalized),
    queryFn: () => apiClients.finance.get<PaginatedResult<SalesOrder>>('/orders', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useOrder(id: string) {
  return useQuery<SalesOrder>({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiClients.finance.get<SalesOrder>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}

/** Create an invoice FROM a confirmed order — the commercial-chain terminus. */
export function useCreateInvoiceFromOrder() {
  const qc = useQueryClient();
  return useMutation<Invoice, Error, { id: string; data?: CreateInvoiceFromOrderInput }>({
    mutationFn: ({ id, data }) => apiClients.finance.post<Invoice>(`/orders/${id}/invoice`, data ?? {}),
    onSuccess: (_inv, { id }) => {
      qc.invalidateQueries({ queryKey: orderKeys.detail(id) });
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      notify.success('Invoice created from order');
    },
    onError: (err) => notify.error('Failed to create invoice', err.message),
  });
}
