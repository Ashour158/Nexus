import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useContests,
  useBadges,
  useMyBadges,
  incentiveKeys,
} from '../use-incentives';

vi.mock('@/lib/api-client', () => ({
  apiClients: {
    incentive: {
      get: vi.fn(),
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

describe('useIncentives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches contests', async () => {
    vi.mocked(apiClients.incentive.get).mockResolvedValueOnce([{ id: 'c1', name: 'Q1 Contest', metric: 'deals_closed', startDate: '2024-01-01', endDate: '2024-03-31' }]);

    const { result } = renderHook(() => useContests(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.incentive.get).toHaveBeenCalledWith('/contests');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe('Q1 Contest');
  });

  it('fetches badges', async () => {
    vi.mocked(apiClients.incentive.get).mockResolvedValueOnce([{ id: 'b1', name: 'Closer', criteriaType: 'deals', criteriaValue: 10 }]);

    const { result } = renderHook(() => useBadges(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.incentive.get).toHaveBeenCalledWith('/badges');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe('Closer');
  });

  it('fetches my badges', async () => {
    vi.mocked(apiClients.incentive.get).mockResolvedValueOnce([{ id: 'mb1', badgeId: 'b1', userId: 'u1', awardedAt: '2024-01-15T00:00:00Z' }]);

    const { result } = renderHook(() => useMyBadges('u1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.incentive.get).toHaveBeenCalledWith('/badges/mine');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].userId).toBe('u1');
  });

  it('handles errors', async () => {
    vi.mocked(apiClients.incentive.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useContests(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(incentiveKeys.contests()).toEqual(['incentives', 'contests']);
    expect(incentiveKeys.badges()).toEqual(['incentives', 'badges']);
    expect(incentiveKeys.myBadges('u1')).toEqual(['incentives', 'myBadges', 'u1']);
  });
});
