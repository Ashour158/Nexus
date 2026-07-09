import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Knowledge domain.
 */

export interface KnowledgeArticle {
  id: string;
  tenantId: string;
  title: string;
  slug?: string | null;
  body: string;
  categoryId?: string | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  authorId: string;
  views: number;
  dealStages?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCategory {
  id: string;
  tenantId: string;
  name: string;
  icon?: string | null;
  parentCategoryId?: string | null;
  position: number;
}

export interface KnowledgeFilters {
  categoryId?: string;
  status?: KnowledgeArticle['status'];
  search?: string;
}

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  lists: () => [...knowledgeKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...knowledgeKeys.lists(), f] as const,
  details: () => [...knowledgeKeys.all, 'detail'] as const,
  detail: (id: string) => [...knowledgeKeys.details(), id] as const,
  categories: () => [...knowledgeKeys.all, 'categories'] as const,
};

export function useKnowledgeArticles(filters: KnowledgeFilters = {}) {
  const normalized: Record<string, unknown> = {
    categoryId: filters.categoryId,
    status: filters.status,
    search: filters.search?.trim() || undefined,
  };
  return useQuery<KnowledgeArticle[]>({
    queryKey: knowledgeKeys.list(normalized),
    queryFn: () =>
      apiClients.knowledge.get<KnowledgeArticle[]>('/knowledge/articles', {
        params: normalized,
      }),
    staleTime: 30_000,
  });
}

export function useKnowledgeArticle(id: string) {
  return useQuery<KnowledgeArticle>({
    queryKey: knowledgeKeys.detail(id),
    queryFn: () =>
      apiClients.knowledge.get<KnowledgeArticle>(`/knowledge/articles/${id}`),
    enabled: Boolean(id),
  });
}

export function useKnowledgeCategories() {
  return useQuery<KnowledgeCategory[]>({
    queryKey: knowledgeKeys.categories(),
    queryFn: () =>
      apiClients.knowledge.get<KnowledgeCategory[]>('/knowledge/categories'),
    staleTime: 60_000,
  });
}

export function useCreateKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation<KnowledgeArticle, Error, { title: string; body: string; categoryId?: string | null; tags?: string[]; status?: KnowledgeArticle['status'] }>({
    mutationFn: (data) =>
      apiClients.knowledge.post<KnowledgeArticle>('/knowledge/articles', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      notify.success('Article created');
    },
    onError: (err) => {
      notify.error('Failed to create article', err.message);
    },
  });
}

export function useUpdateKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation<KnowledgeArticle, Error, { id: string; data: Partial<KnowledgeArticle> }>({
    mutationFn: ({ id, data }) =>
      apiClients.knowledge.patch<KnowledgeArticle>(`/knowledge/articles/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.detail(id) });
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      notify.success('Article updated');
    },
    onError: (err) => {
      notify.error('Failed to update article', err.message);
    },
  });
}

export function useDeleteKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiClients.knowledge.delete<void>(`/knowledge/articles/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: knowledgeKeys.detail(id) });
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      notify.success('Article deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete article', err.message);
    },
  });
}

export function usePublishKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation<KnowledgeArticle, Error, string>({
    mutationFn: (id) =>
      apiClients.knowledge.post<KnowledgeArticle>(`/knowledge/articles/${id}/publish`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.detail(id) });
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      notify.success('Article published');
    },
    onError: (err) => {
      notify.error('Failed to publish article', err.message);
    },
  });
}

export function useArchiveKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation<KnowledgeArticle, Error, string>({
    mutationFn: (id) =>
      apiClients.knowledge.post<KnowledgeArticle>(`/knowledge/articles/${id}/archive`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.detail(id) });
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      notify.success('Article archived');
    },
    onError: (err) => {
      notify.error('Failed to archive article', err.message);
    },
  });
}
