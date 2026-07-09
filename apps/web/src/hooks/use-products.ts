import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { PaginatedResult } from '@nexus/shared-types';
import type { CreateProductInput, UpdateProductInput } from '@nexus/validation';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Finance/Products domain.
 */

export interface Product {
  id: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  unitAr?: string | null;
  sku: string;
  listPrice: string;
  currency: string;
  billingType?: string;
  isActive?: boolean;
  category?: string | null;
  type?: string;
  cost?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ProductPaginatedResult extends PaginatedResult<Product> {}

export interface ProductListFilters {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  type?: string;
}

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...productKeys.lists(), f] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
};

export function useProducts(filters: ProductListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    search: filters.search?.trim() || undefined,
    isActive: filters.isActive,
    type: filters.type,
  };
  return useQuery<ProductPaginatedResult>({
    queryKey: productKeys.list(normalized),
    queryFn: () =>
      apiClients.finance.get<ProductPaginatedResult>('/products', {
        params: normalized,
      }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useProduct(id: string) {
  return useQuery<Product>({
    queryKey: productKeys.detail(id),
    queryFn: () => apiClients.finance.get<Product>(`/products/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation<Product, Error, CreateProductInput>({
    mutationFn: (data) => apiClients.finance.post<Product>('/products', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productKeys.lists() });
      notify.success('Product created');
    },
    onError: (err) => {
      notify.error('Failed to create product', err.message);
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation<Product, Error, { id: string; data: UpdateProductInput }>({
    mutationFn: ({ id, data }) =>
      apiClients.finance.patch<Product>(`/products/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: productKeys.detail(id) });
      qc.invalidateQueries({ queryKey: productKeys.lists() });
      notify.success('Product updated');
    },
    onError: (err) => {
      notify.error('Failed to update product', err.message);
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.finance.delete<void>(`/products/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: productKeys.detail(id) });
      qc.invalidateQueries({ queryKey: productKeys.lists() });
      notify.success('Product deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete product', err.message);
    },
  });
}
