import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients, api } from '@/lib/api-client';
import {
  useQuotes,
  useQuote,
  useCreateQuote,
  useUpdateQuote,
  useDeleteQuote,
  useSendQuote,
  useAcceptQuote,
  useRejectQuote,
  useDealQuotes,
  useQuoteTemplates,
  quoteKeys,
} from '../use-quotes';

vi.mock('@/lib/api-client', () => ({
  apiClients: {
    finance: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    quotes: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  },
  api: {
    get: vi.fn(),
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

describe('useQuotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function mockFetch(data: unknown, status = 200) {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: status < 400, data, error: status >= 400 ? { message: 'No access' } : undefined }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('fetches paginated quotes', async () => {
    vi.mocked(apiClients.quotes.get).mockResolvedValueOnce({
      data: [{ id: 'q1', name: 'Quote 1', status: 'DRAFT', dealId: 'd1' }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const { result } = renderHook(() => useQuotes(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.quotes.get).toHaveBeenCalledWith('/quotes', { params: expect.objectContaining({ page: 1, limit: 25 }) });
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].name).toBe('Quote 1');
  });

  it('fetches quote by id', async () => {
    const fetchMock = mockFetch({ id: 'q1', name: 'Quote 1', status: 'DRAFT', dealId: 'd1' });

    const { result } = renderHook(() => useQuote('q1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/quotes/q1', expect.objectContaining({ cache: 'no-store' }));
    expect(result.current.data?.id).toBe('q1');
  });

  it('does not fetch quote templates when admin governance is disabled', () => {
    const fetchMock = mockFetch([]);

    const { result } = renderHook(() => useQuoteTemplates({ enabled: false }), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches deal-scoped quotes', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [{ id: 'q1', name: 'Quote 1', status: 'DRAFT', dealId: 'd1' }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const { result } = renderHook(() => useDealQuotes('d1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/deals/d1/quotes');
    expect(result.current.data?.data).toHaveLength(1);
  });

  it('creates a quote', async () => {
    vi.mocked(apiClients.quotes.post).mockResolvedValueOnce({ quote: { id: 'q2', name: 'Quote 2', status: 'DRAFT', dealId: 'd1' }, pricing: {} });

    const { result } = renderHook(() => useCreateQuote(), { wrapper: createWrapper() });
    result.current.mutate({ dealId: 'd1', ownerId: 'u1', accountId: 'a1', name: 'Quote 2', items: [] } as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.quotes.post).toHaveBeenCalledWith('/quotes', { dealId: 'd1', ownerId: 'u1', accountId: 'a1', name: 'Quote 2', items: [] });
    expect(result.current.data?.name).toBe('Quote 2');
  });

  it('updates a quote', async () => {
    vi.mocked(apiClients.quotes.patch).mockResolvedValueOnce({ id: 'q1', name: 'Updated Quote', status: 'DRAFT', dealId: 'd1' });

    const { result } = renderHook(() => useUpdateQuote(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'q1', data: { name: 'Updated Quote' } as any });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.quotes.patch).toHaveBeenCalledWith('/quotes/q1', { name: 'Updated Quote' });
    expect(result.current.data?.name).toBe('Updated Quote');
  });

  it('sends a quote', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'q1', name: 'Quote 1', status: 'SENT', dealId: 'd1' });

    const { result } = renderHook(() => useSendQuote(), { wrapper: createWrapper() });
    result.current.mutate('q1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/quotes/q1/send');
    expect(result.current.data?.status).toBe('SENT');
  });

  it('accepts a quote', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'q1', name: 'Quote 1', status: 'ACCEPTED', dealId: 'd1' });

    const { result } = renderHook(() => useAcceptQuote(), { wrapper: createWrapper() });
    result.current.mutate('q1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/quotes/q1/accept');
    expect(result.current.data?.status).toBe('ACCEPTED');
  });

  it('rejects a quote', async () => {
    vi.mocked(apiClients.finance.post).mockResolvedValueOnce({ id: 'q1', name: 'Quote 1', status: 'REJECTED', dealId: 'd1' });

    const { result } = renderHook(() => useRejectQuote(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'q1', reason: 'Too expensive' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.post).toHaveBeenCalledWith('/quotes/q1/reject', { reason: 'Too expensive' });
    expect(result.current.data?.status).toBe('REJECTED');
  });

  it('deletes a quote', async () => {
    vi.mocked(apiClients.quotes.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteQuote(), { wrapper: createWrapper() });
    result.current.mutate('q1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.quotes.delete).toHaveBeenCalledWith('/quotes/q1');
  });

  it('handles errors', async () => {
    vi.mocked(apiClients.quotes.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useQuotes(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(quoteKeys.list({ page: 1 })).toEqual(['quotes', 'list', { page: 1 }]);
    expect(quoteKeys.detail('q1')).toEqual(['quotes', 'detail', 'q1']);
    expect(quoteKeys.forDeal('d1')).toEqual(['quotes', 'deal', 'd1']);
  });
});
