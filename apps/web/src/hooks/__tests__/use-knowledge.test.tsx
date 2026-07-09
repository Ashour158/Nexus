import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClients } from '@/lib/api-client';
import {
  useKnowledgeArticles,
  useKnowledgeArticle,
  useKnowledgeCategories,
  useCreateKnowledgeArticle,
  useUpdateKnowledgeArticle,
  useDeleteKnowledgeArticle,
  usePublishKnowledgeArticle,
  useArchiveKnowledgeArticle,
  knowledgeKeys,
} from '../use-knowledge';

vi.mock('@/lib/api-client', () => ({
  apiClients: {
    knowledge: {
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

describe('useKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches knowledge articles', async () => {
    vi.mocked(apiClients.knowledge.get).mockResolvedValueOnce([{ id: 'a1', title: 'Article 1', status: 'DRAFT', body: 'Content', tags: [], views: 0 }]);

    const { result } = renderHook(() => useKnowledgeArticles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.get).toHaveBeenCalledWith('/knowledge/articles', { params: expect.any(Object) });
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].title).toBe('Article 1');
  });

  it('fetches article by id', async () => {
    vi.mocked(apiClients.knowledge.get).mockResolvedValueOnce({ id: 'a1', title: 'Article 1', status: 'DRAFT', body: 'Content', tags: [], views: 0 });

    const { result } = renderHook(() => useKnowledgeArticle('a1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.get).toHaveBeenCalledWith('/knowledge/articles/a1');
    expect(result.current.data?.id).toBe('a1');
  });

  it('fetches categories', async () => {
    vi.mocked(apiClients.knowledge.get).mockResolvedValueOnce([{ id: 'cat1', name: 'Category 1', position: 0 }]);

    const { result } = renderHook(() => useKnowledgeCategories(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.get).toHaveBeenCalledWith('/knowledge/categories');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe('Category 1');
  });

  it('creates an article', async () => {
    vi.mocked(apiClients.knowledge.post).mockResolvedValueOnce({ id: 'a2', title: 'Article 2', status: 'DRAFT', body: 'Body', tags: [], views: 0 });

    const { result } = renderHook(() => useCreateKnowledgeArticle(), { wrapper: createWrapper() });
    result.current.mutate({ title: 'Article 2', body: 'Body' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.post).toHaveBeenCalledWith('/knowledge/articles', { title: 'Article 2', body: 'Body' });
    expect(result.current.data?.title).toBe('Article 2');
  });

  it('updates an article', async () => {
    vi.mocked(apiClients.knowledge.patch).mockResolvedValueOnce({ id: 'a1', title: 'Updated Article', status: 'DRAFT', body: 'Content', tags: [], views: 0 });

    const { result } = renderHook(() => useUpdateKnowledgeArticle(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'a1', data: { title: 'Updated Article' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.patch).toHaveBeenCalledWith('/knowledge/articles/a1', { title: 'Updated Article' });
    expect(result.current.data?.title).toBe('Updated Article');
  });

  it('deletes an article', async () => {
    vi.mocked(apiClients.knowledge.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteKnowledgeArticle(), { wrapper: createWrapper() });
    result.current.mutate('a1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.delete).toHaveBeenCalledWith('/knowledge/articles/a1');
  });

  it('publishes an article', async () => {
    vi.mocked(apiClients.knowledge.post).mockResolvedValueOnce({ id: 'a1', title: 'Article 1', status: 'PUBLISHED', body: 'Content', tags: [], views: 0 });

    const { result } = renderHook(() => usePublishKnowledgeArticle(), { wrapper: createWrapper() });
    result.current.mutate('a1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.post).toHaveBeenCalledWith('/knowledge/articles/a1/publish');
    expect(result.current.data?.status).toBe('PUBLISHED');
  });

  it('archives an article', async () => {
    vi.mocked(apiClients.knowledge.post).mockResolvedValueOnce({ id: 'a1', title: 'Article 1', status: 'ARCHIVED', body: 'Content', tags: [], views: 0 });

    const { result } = renderHook(() => useArchiveKnowledgeArticle(), { wrapper: createWrapper() });
    result.current.mutate('a1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClients.knowledge.post).toHaveBeenCalledWith('/knowledge/articles/a1/archive');
    expect(result.current.data?.status).toBe('ARCHIVED');
  });

  it('handles errors', async () => {
    vi.mocked(apiClients.knowledge.get).mockRejectedValueOnce(new Error('No access'));

    const { result } = renderHook(() => useKnowledgeArticles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('uses correct query keys', () => {
    expect(knowledgeKeys.list({ status: 'DRAFT' })).toEqual(['knowledge', 'list', { status: 'DRAFT' }]);
    expect(knowledgeKeys.detail('a1')).toEqual(['knowledge', 'detail', 'a1']);
    expect(knowledgeKeys.categories()).toEqual(['knowledge', 'categories']);
  });
});
