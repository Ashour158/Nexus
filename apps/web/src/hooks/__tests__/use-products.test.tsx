import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useProducts,
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  productKeys,
} from '../use-products';

vi.mock('@/lib/api-client', () => ({
  apiClients: {
    finance: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches paginated products', async () => {
    vi.mocked(apiClients.finance.get).mockResolvedValueOnce({
      data: [{ id: 'p1', name: 'Product 1', sku: 'SKU-001', listPrice: '99.99' }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const { result } = renderHook(() => useProducts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.get).toHaveBeenCalledWith('/products', { params: expect.objectContaining({ page: 1, limit: 25 }) });
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].sku).toBe('SKU-001');
  });

  it('fetches product by id', async () => {
    vi.mocked(apiClients.finance.get).mockResolvedValueOnce({ id: 'p1', name: 'Product 1', sku: 'SKU-001', listPrice: '99.99' });

    const { result } = renderHook(() => useProduct('p1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.get).toHaveBeenCalledWith('/products/p1');
    expect(result.current.data?.id).toBe('p1');
  });

  it('creates a product', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'p2', name: 'Product 2', sku: 'SKU-002', listPrice: '49.99' });

    const { result } = renderHook(() => useCreateProduct(), { wrapper: createWrapper() });
    result.current.mutate({ name: 'Product 2', sku: 'SKU-002', listPrice: '49.99', currency: 'USD' } as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/products', { name: 'Product 2', sku: 'SKU-002', listPrice: '49.99', currency: 'USD' });
    expect(result.current.data?.sku).toBe('SKU-002');
  });

  it('updates a product', async () => {
    vi.mocked(apiClients.finance.patch).mockResolvedValueOnce({ id: 'p1', name: 'Updated Product', sku: 'SKU-001', listPrice: '79.99' });

    const { result } = renderHook(() => useUpdateProduct(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'p1', data: { name: 'Updated Product' } as any });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.patch).toHaveBeenCalledWith('/products/p1', { name: 'Updated Product' });
    expect(result.current.data?.name).toBe('Updated Product');
  });

  it('deletes a product', async () => {
    vi.mocked(apiClients.finance.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteProduct(), { wrapper: createWrapper() });
    result.current.mutate('p1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.delete).toHaveBeenCalledWith('/products/p1');
  });

  it('handles errors', async () => {
    vi.mocked(apiClients.finance.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useProducts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(productKeys.list({ page: 1 })).toEqual(['products', 'list', { page: 1 }]);
    expect(productKeys.detail('p1')).toEqual(['products', 'detail', 'p1']);
  });
});
