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

export function useProducts(search?: string) {
  return useQuery<PaginatedResult<Product>>({
    queryKey: ['products', { search: search?.trim() || '' }],
    queryFn: () =>
      apiClients.finance.get<PaginatedResult<Product>>('/products', {
        params: { search: search?.trim() || undefined, limit: 100 },
      }),
    staleTime: 60_000,
  });
}
