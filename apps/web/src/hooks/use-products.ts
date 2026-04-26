import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

export interface Product {
  id: string;
  name: string;
  sku: string;
  listPrice: string;
  currency: string;
  billingType?: string;
  isActive?: boolean;
}

interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductListFilters {
  search?: string;
  isActive?: boolean;
  limit?: number;
}

export function useProducts(filters: ProductListFilters | string = {}) {
  const normalized =
    typeof filters === 'string'
      ? { search: filters.trim() || undefined, isActive: undefined, limit: 100 }
      : {
          search: filters.search?.trim() || undefined,
          isActive: filters.isActive,
          limit: filters.limit ?? 100,
        };
  return useQuery<PaginatedResult<Product>>({
    queryKey: ['products', normalized],
    queryFn: () =>
      apiClients.finance.get<PaginatedResult<Product>>('/products', {
        params: {
          search: normalized.search,
          isActive: normalized.isActive,
          limit: normalized.limit,
        },
      }),
    staleTime: 60_000,
  });
}
