import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

/**
 * Saved-views hooks — wire to crm-service:
 *   - GET    /saved-views?entityType=account|contact
 *   - POST   /saved-views  { entityType, name, filters, columns?, isShared? }
 *   - PATCH  /saved-views/:id
 *   - DELETE /saved-views/:id
 *
 * The list query degrades to [] on 404 / error so the control renders even
 * before the backend deploys.
 */

export type SavedViewEntityType =
  | 'account'
  | 'contact'
  | 'lead'
  | 'deal'
  | 'quote'
  | 'ticket'
  | 'invoice'
  | 'activity';

export interface SavedView {
  id: string;
  name: string;
  entityType?: SavedViewEntityType;
  filters: Record<string, unknown>;
  columns?: string[];
  isShared: boolean;
  ownerId: string;
}

export interface CreateSavedViewInput {
  entityType: SavedViewEntityType;
  name: string;
  filters: Record<string, unknown>;
  columns?: string[];
  isShared?: boolean;
}

export const savedViewKeys = {
  all: ['saved-views'] as const,
  list: (entityType: SavedViewEntityType) =>
    [...savedViewKeys.all, entityType] as const,
};

/** Saved views for an entity type. Returns [] on 404 / error. */
export function useSavedViews(entityType: SavedViewEntityType) {
  return useQuery<SavedView[]>({
    queryKey: savedViewKeys.list(entityType),
    queryFn: async () => {
      try {
        return await api.get<SavedView[]>('/saved-views', {
          params: { entityType },
        });
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation<SavedView, Error, CreateSavedViewInput>({
    mutationFn: (data) => api.post<SavedView>('/saved-views', data),
    onSuccess: (_view, vars) => {
      qc.invalidateQueries({ queryKey: savedViewKeys.list(vars.entityType) });
    },
  });
}

interface UpdateSavedViewVars {
  id: string;
  entityType: SavedViewEntityType;
  data: Partial<Omit<CreateSavedViewInput, 'entityType'>>;
}

export function useUpdateSavedView() {
  const qc = useQueryClient();
  return useMutation<SavedView, Error, UpdateSavedViewVars>({
    mutationFn: ({ id, data }) => api.patch<SavedView>(`/saved-views/${id}`, data),
    onSuccess: (_view, vars) => {
      qc.invalidateQueries({ queryKey: savedViewKeys.list(vars.entityType) });
    },
  });
}

interface DeleteSavedViewVars {
  id: string;
  entityType: SavedViewEntityType;
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation<void, Error, DeleteSavedViewVars>({
    mutationFn: ({ id }) => api.delete<void>(`/saved-views/${id}`),
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: savedViewKeys.list(vars.entityType) });
    },
  });
}
