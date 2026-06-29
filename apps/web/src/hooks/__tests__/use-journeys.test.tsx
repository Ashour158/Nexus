import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useJourneys,
  useJourney,
  useJourneyEnrollments,
  useCreateJourney,
  useUpdateJourney,
  useDeleteJourney,
  useActivateJourney,
  usePauseJourney,
  useArchiveJourney,
  journeyKeys,
} from '../use-journeys';

vi.mock('@/lib/api-client', () => ({
  apiClients: {
    workflow: {
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

describe('useJourneys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches paginated journeys', async () => {
    vi.mocked(apiClients.workflow.get).mockResolvedValueOnce({
      data: [{ id: 'j1', name: 'Journey 1', status: 'DRAFT', entryTrigger: 'deal_created' }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const { result } = renderHook(() => useJourneys(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.get).toHaveBeenCalledWith('/journeys', { params: expect.objectContaining({ page: 1, limit: 25 }) });
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].name).toBe('Journey 1');
  });

  it('fetches journey by id', async () => {
    vi.mocked(apiClients.workflow.get).mockResolvedValueOnce({ id: 'j1', name: 'Journey 1', status: 'DRAFT', entryTrigger: 'deal_created' });

    const { result } = renderHook(() => useJourney('j1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.get).toHaveBeenCalledWith('/journeys/j1');
    expect(result.current.data?.id).toBe('j1');
  });

  it('fetches journey enrollments', async () => {
    vi.mocked(apiClients.workflow.get).mockResolvedValueOnce({
      data: [{ id: 'e1', journeyId: 'j1', contactId: 'c1', status: 'active' }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const { result } = renderHook(() => useJourneyEnrollments('j1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.get).toHaveBeenCalledWith('/journeys/j1/enrollments', { params: expect.objectContaining({ page: 1, limit: 25 }) });
    expect(result.current.data?.data).toHaveLength(1);
  });

  it('creates a journey', async () => {
    vi.mocked(apiClients.workflow.post).mockResolvedValueOnce({ id: 'j2', name: 'Journey 2', status: 'DRAFT', entryTrigger: 'contact_created' });

    const { result } = renderHook(() => useCreateJourney(), { wrapper: createWrapper() });
    result.current.mutate({ name: 'Journey 2', entryTrigger: 'contact_created' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.post).toHaveBeenCalledWith('/journeys', { name: 'Journey 2', entryTrigger: 'contact_created' });
    expect(result.current.data?.name).toBe('Journey 2');
  });

  it('updates a journey', async () => {
    vi.mocked(apiClients.workflow.patch).mockResolvedValueOnce({ id: 'j1', name: 'Updated Journey', status: 'DRAFT', entryTrigger: 'deal_created' });

    const { result } = renderHook(() => useUpdateJourney(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'j1', data: { name: 'Updated Journey' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.patch).toHaveBeenCalledWith('/journeys/j1', { name: 'Updated Journey' });
    expect(result.current.data?.name).toBe('Updated Journey');
  });

  it('deletes a journey', async () => {
    vi.mocked(apiClients.workflow.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteJourney(), { wrapper: createWrapper() });
    result.current.mutate('j1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.delete).toHaveBeenCalledWith('/journeys/j1');
  });

  it('activates a journey', async () => {
    vi.mocked(apiClients.workflow.post).mockResolvedValueOnce({ id: 'j1', name: 'Journey 1', status: 'ACTIVE', entryTrigger: 'deal_created' });

    const { result } = renderHook(() => useActivateJourney(), { wrapper: createWrapper() });
    result.current.mutate('j1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.post).toHaveBeenCalledWith('/journeys/j1/activate');
    expect(result.current.data?.status).toBe('ACTIVE');
  });

  it('pauses a journey', async () => {
    vi.mocked(apiClients.workflow.post).mockResolvedValueOnce({ id: 'j1', name: 'Journey 1', status: 'PAUSED', entryTrigger: 'deal_created' });

    const { result } = renderHook(() => usePauseJourney(), { wrapper: createWrapper() });
    result.current.mutate('j1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.post).toHaveBeenCalledWith('/journeys/j1/pause');
    expect(result.current.data?.status).toBe('PAUSED');
  });

  it('archives a journey', async () => {
    vi.mocked(apiClients.workflow.post).mockResolvedValueOnce({ id: 'j1', name: 'Journey 1', status: 'ARCHIVED', entryTrigger: 'deal_created' });

    const { result } = renderHook(() => useArchiveJourney(), { wrapper: createWrapper() });
    result.current.mutate('j1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.workflow.post).toHaveBeenCalledWith('/journeys/j1/archive');
    expect(result.current.data?.status).toBe('ARCHIVED');
  });

  it('handles errors', async () => {
    vi.mocked(apiClients.workflow.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useJourneys(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(journeyKeys.list({ page: 1 })).toEqual(['journeys', 'list', { page: 1 }]);
    expect(journeyKeys.detail('j1')).toEqual(['journeys', 'detail', 'j1']);
    expect(journeyKeys.enrollments('j1')).toEqual(['journeys', 'detail', 'j1', 'enrollments']);
  });
});
