import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useDocuments,
  useDocumentDownloadUrl,
  useUploadDocument,
  useDeleteDocument,
  documentKeys,
} from '../use-documents';

vi.mock('@/lib/api-client', () => ({
  apiClients: {
    storage: {
      get: vi.fn(),
      post: vi.fn(),
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

describe('useDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches documents for entity', async () => {
    vi.mocked(apiClients.storage.get).mockResolvedValueOnce([{ id: 'f1', filename: 'contract.pdf', entityType: 'deal', entityId: 'd1' }]);

    const { result } = renderHook(() => useDocuments('deal', 'd1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.storage.get).toHaveBeenCalledWith('/files/deal/d1');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].filename).toBe('contract.pdf');
  });

  it('fetches download url', async () => {
    vi.mocked(apiClients.storage.get).mockResolvedValueOnce({ url: 'https://cdn.example.com/f1', expiresAt: new Date().toISOString() });

    const { result } = renderHook(() => useDocumentDownloadUrl('f1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.storage.get).toHaveBeenCalledWith('/files/f1/download-url', { params: { expirySeconds: 3600 } });
    expect(result.current.data?.url).toBe('https://cdn.example.com/f1');
  });

  it('uploads a document', async () => {
    vi.mocked(apiClients.storage.post).mockResolvedValueOnce({ id: 'f2', filename: 'upload.pdf', entityType: 'deal', entityId: 'd1' });

    const { result } = renderHook(() => useUploadDocument(), { wrapper: createWrapper() });
    const file = new File(['content'], 'upload.pdf', { type: 'application/pdf' });
    result.current.mutate({ file, entityType: 'deal', entityId: 'd1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.storage.post).toHaveBeenCalledWith('/files/upload', expect.any(FormData), { headers: { 'Content-Type': 'multipart/form-data' } });
    expect(result.current.data?.filename).toBe('upload.pdf');
  });

  it('deletes a document', async () => {
    vi.mocked(apiClients.storage.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteDocument(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'f1', entityType: 'deal', entityId: 'd1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.storage.delete).toHaveBeenCalledWith('/files/f1');
  });

  it('handles errors', async () => {
    vi.mocked(apiClients.storage.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useDocuments('deal', 'd1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(documentKeys.list('deal', 'd1')).toEqual(['documents', 'list', 'deal', 'd1']);
    expect(documentKeys.detail('f1')).toEqual(['documents', 'detail', 'f1']);
  });
});
