import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for Deal product line items.
 *
 * Backed by crm-service endpoints (base `/bff/crm` in dev via the `api`
 * client):
 *   GET    /deals/:id/products
 *   POST   /deals/:id/products
 *   PATCH  /deal-products/:id
 *   DELETE /deal-products/:id
 *
 * Adding/removing/editing line items recomputes `Deal.amount` server-side, so
 * mutations also invalidate the deal detail cache.
 */

export interface DealProduct {
  id: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  currency: string;
}

export interface CreateDealProductInput {
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  productId?: string;
}

export type UpdateDealProductInput = Partial<CreateDealProductInput>;

export const dealProductKeys = {
  all: ['deal-products'] as const,
  forDeal: (dealId: string) => [...dealProductKeys.all, dealId] as const,
};

export function useDealProducts(dealId: string) {
  return useQuery<DealProduct[]>({
    queryKey: dealProductKeys.forDeal(dealId),
    queryFn: () => api.get<DealProduct[]>(`/deals/${dealId}/products`),
    enabled: Boolean(dealId),
    staleTime: 30_000,
    // Endpoint may 404 until the backend deploys — don't hammer it.
    retry: false,
  });
}

export function useAddDealProduct(dealId: string) {
  const qc = useQueryClient();
  return useMutation<DealProduct, Error, CreateDealProductInput>({
    mutationFn: (data) => api.post<DealProduct>(`/deals/${dealId}/products`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealProductKeys.forDeal(dealId) });
      qc.invalidateQueries({ queryKey: ['deals', 'detail', dealId] });
      notify.success('Line item added');
    },
    onError: (err) => notify.error('Failed to add line item', err.message),
  });
}

export function useUpdateDealProduct(dealId: string) {
  const qc = useQueryClient();
  return useMutation<DealProduct, Error, { id: string; data: UpdateDealProductInput }>({
    mutationFn: ({ id, data }) => api.patch<DealProduct>(`/deal-products/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealProductKeys.forDeal(dealId) });
      qc.invalidateQueries({ queryKey: ['deals', 'detail', dealId] });
    },
    onError: (err) => notify.error('Failed to update line item', err.message),
  });
}

export function useRemoveDealProduct(dealId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete<void>(`/deal-products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealProductKeys.forDeal(dealId) });
      qc.invalidateQueries({ queryKey: ['deals', 'detail', dealId] });
      notify.success('Line item removed');
    },
    onError: (err) => notify.error('Failed to remove line item', err.message),
  });
}
