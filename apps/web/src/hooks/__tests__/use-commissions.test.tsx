import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useCommissions,
  useCommissionSummary,
  useApproveCommission,
  useClawbackCommission,
  commissionKeys,
} from '../use-commissions';

vi.mock('@/lib/api-client', () => ({
  apiClients: {
    finance: {
      get: vi.fn(),
      post: vi.fn(),
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

describe('useCommissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches paginated commissions', async () => {
    vi.mocked(apiClients.finance.get).mockResolvedValueOnce({
      data: [{ id: 'c1', userId: 'u1', dealId: 'd1', finalAmount: '100.00', status: 'PENDING' }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const { result } = renderHook(() => useCommissions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.get).toHaveBeenCalledWith('/commissions', { params: expect.objectContaining({ page: 1, limit: 25 }) });
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].status).toBe('PENDING');
  });

  it('fetches commission summary', async () => {
    vi.mocked(apiClients.finance.get).mockResolvedValueOnce({ userId: 'u1', totalCommissions: 10, totalApproved: 5, totalPaid: 3, totalPending: 2, year: 2024 });

    const { result } = renderHook(() => useCommissionSummary({ ownerId: 'u1', year: 2024 }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.get).toHaveBeenCalledWith('/commissions/summary', { params: expect.objectContaining({ ownerId: 'u1', year: 2024 }) });
    expect(result.current.data?.totalCommissions).toBe(10);
  });

  it('approves a commission', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'c1', userId: 'u1', dealId: 'd1', finalAmount: '100.00', status: 'APPROVED' });

    const { result } = renderHook(() => useApproveCommission(), { wrapper: createWrapper() });
    result.current.mutate('c1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/commissions/c1/approve');
    expect(result.current.data?.status).toBe('APPROVED');
  });

  it('claws back a commission', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'c1', userId: 'u1', dealId: 'd1', finalAmount: '100.00', status: 'CLAWED_BACK' });

    const { result } = renderHook(() => useClawbackCommission(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'c1', data: { reason: 'Deal reversed' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/commissions/c1/clawback', { reason: 'Deal reversed' });
    expect(result.current.data?.status).toBe('CLAWED_BACK');
  });

  it('handles errors', async () => {
    vi.mocked(apiClients.finance.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useCommissions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(commissionKeys.list({ page: 1 })).toEqual(['commissions', 'list', { page: 1 }]);
    expect(commissionKeys.summary({ ownerId: 'u1' })).toEqual(['commissions', 'summary', { ownerId: 'u1' }]);
  });
});
