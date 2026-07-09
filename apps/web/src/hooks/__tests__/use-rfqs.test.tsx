import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useRFQs,
  useRFQ,
  useCreateRFQ,
  useUpdateRFQ,
  useDeleteRFQ,
  useSendRFQ,
  useConvertRFQToQuote,
  rfqKeys,
} from '../use-rfqs';

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

describe('useRFQs', () => {
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

  it('fetches RFQs with filters', async () => {
    const fetchMock = mockFetch({ data: [{ id: 'r1', title: 'RFQ 1', status: 'DRAFT', rfqNumber: 'RFQ-001' }] });

    const { result } = renderHook(() => useRFQs({ status: 'DRAFT' }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/finance/rfqs?status=DRAFT', expect.objectContaining({ cache: 'no-store' }));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].title).toBe('RFQ 1');
  });

  it('fetches RFQ by id', async () => {
    const fetchMock = mockFetch({ id: 'r1', title: 'RFQ 1', status: 'DRAFT', rfqNumber: 'RFQ-001' });

    const { result } = renderHook(() => useRFQ('r1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/finance/rfqs/r1', expect.objectContaining({ cache: 'no-store' }));
    expect(result.current.data?.id).toBe('r1');
  });

  it('creates an RFQ', async () => {
    const fetchMock = mockFetch({ id: 'r2', title: 'RFQ 2', status: 'DRAFT', rfqNumber: 'RFQ-002' }, 201);

    const { result } = renderHook(() => useCreateRFQ(), { wrapper: createWrapper() });
    result.current.mutate({ title: 'RFQ 2' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/finance/rfqs', expect.objectContaining({ method: 'POST' }));
    expect(result.current.data?.title).toBe('RFQ 2');
  });

  it('updates an RFQ', async () => {
    vi.mocked(apiClients.finance.patch).mockResolvedValueOnce({ id: 'r1', title: 'Updated RFQ', status: 'DRAFT', rfqNumber: 'RFQ-001' });

    const { result } = renderHook(() => useUpdateRFQ(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'r1', data: { title: 'Updated RFQ' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.patch).toHaveBeenCalledWith('/rfqs/r1', { title: 'Updated RFQ' });
    expect(result.current.data?.title).toBe('Updated RFQ');
  });

  it('deletes an RFQ', async () => {
    vi.mocked(apiClients.finance.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteRFQ(), { wrapper: createWrapper() });
    result.current.mutate('r1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.finance.delete).toHaveBeenCalledWith('/rfqs/r1');
  });

  it('sends an RFQ', async () => {
    const fetchMock = mockFetch({ id: 'r1', title: 'RFQ 1', status: 'SUBMITTED_FOR_REVIEW', rfqNumber: 'RFQ-001' });

    const { result } = renderHook(() => useSendRFQ(), { wrapper: createWrapper() });
    result.current.mutate('r1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/finance/rfqs/r1/send', expect.objectContaining({ method: 'POST' }));
    expect(result.current.data?.status).toBe('SUBMITTED_FOR_REVIEW');
  });

  it('converts an RFQ to quote', async () => {
    const fetchMock = mockFetch({ rfqId: 'r1', quoteId: 'q1' }, 201);

    const { result } = renderHook(() => useConvertRFQToQuote(), { wrapper: createWrapper() });
    result.current.mutate('r1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/finance/rfqs/r1/convert', expect.objectContaining({ method: 'POST' }));
    expect(result.current.data?.quoteId).toBe('q1');
  });

  it('handles errors', async () => {
    mockFetch(undefined, 403);

    const { result } = renderHook(() => useRFQs(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(rfqKeys.list({ status: 'DRAFT' })).toEqual(['rfqs', 'list', { status: 'DRAFT' }]);
    expect(rfqKeys.detail('r1')).toEqual(['rfqs', 'detail', 'r1']);
  });
});
