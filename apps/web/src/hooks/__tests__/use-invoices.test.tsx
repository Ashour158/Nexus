import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useInvoices,
  useInvoice,
  useCreateInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  useRecordPayment,
  useVoidInvoice,
  invoiceKeys,
} from '../use-invoices';

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

describe('useInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches paginated invoices', async () => {
    vi.mocked(apiClients.finance.get).mockResolvedValueOnce({
      data: [{ id: 'inv1', invoiceNumber: 'INV-001', total: '100.00', status: 'DRAFT' }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.get).toHaveBeenCalledWith('/invoices', { params: expect.objectContaining({ page: 1, limit: 25 }) });
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].invoiceNumber).toBe('INV-001');
  });

  it('fetches invoice by id', async () => {
    vi.mocked(apiClients.finance.get).mockResolvedValueOnce({ id: 'inv1', invoiceNumber: 'INV-001', total: '100.00', status: 'DRAFT' });

    const { result } = renderHook(() => useInvoice('inv1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.get).toHaveBeenCalledWith('/invoices/inv1');
    expect(result.current.data?.id).toBe('inv1');
  });

  it('creates an invoice and invalidates list', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'inv2', invoiceNumber: 'INV-002', total: '200.00', status: 'DRAFT' });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });
    result.current.mutate({ accountId: 'acc1', invoiceNumber: 'INV-002', total: '200.00' } as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/invoices', { accountId: 'acc1', invoiceNumber: 'INV-002', total: '200.00' });
    expect(result.current.data?.invoiceNumber).toBe('INV-002');
  });

  it('updates an invoice and invalidates detail and list', async () => {
    vi.mocked(apiClients.finance.patch).mockResolvedValueOnce({ id: 'inv1', invoiceNumber: 'INV-001', total: '150.00', status: 'DRAFT' });

    const { result } = renderHook(() => useUpdateInvoice(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'inv1', data: { total: '150.00' } as any });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.patch).toHaveBeenCalledWith('/invoices/inv1', { total: '150.00' });
    expect(result.current.data?.total).toBe('150.00');
  });

  it('voids an invoice', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'inv1', invoiceNumber: 'INV-001', status: 'VOID' });

    const { result } = renderHook(() => useVoidInvoice(), { wrapper: createWrapper() });
    result.current.mutate('inv1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/invoices/inv1/void');
    expect(result.current.data?.status).toBe('VOID');
  });

  it('records a payment', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'pay1', invoiceId: 'inv1', amount: '50.00', method: 'card' });

    const { result } = renderHook(() => useRecordPayment(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'inv1', data: { amount: '50.00', method: 'card' } as any });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/invoices/inv1/payments', { amount: '50.00', method: 'card' });
    expect(result.current.data?.amount).toBe('50.00');
  });

  it('deletes an invoice', async () => {
    vi.mocked(apiClients.finance.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });
    result.current.mutate('inv1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.delete).toHaveBeenCalledWith('/invoices/inv1');
  });

  it('handles error responses', async () => {
    vi.mocked(apiClients.finance.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(invoiceKeys.list({ page: 1 })).toEqual(['invoices', 'list', { page: 1 }]);
    expect(invoiceKeys.detail('inv1')).toEqual(['invoices', 'detail', 'inv1']);
    expect(invoiceKeys.payments('inv1')).toEqual(['invoices', 'detail', 'inv1', 'payments']);
  });
});
