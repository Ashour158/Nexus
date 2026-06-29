import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Storage/Documents domain.
 */

export interface FileRecord {
  id: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
  entityType: string;
  entityId: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadUrlResult {
  url: string;
  expiresAt: string;
}

export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (entityType: string, entityId: string) =>
    [...documentKeys.lists(), entityType, entityId] as const,
  detail: (id: string) => [...documentKeys.all, 'detail', id] as const,
};

export function useDocuments(entityType: string, entityId: string) {
  return useQuery<FileRecord[]>({
    queryKey: documentKeys.list(entityType, entityId),
    queryFn: () =>
      apiClients.storage.get<FileRecord[]>(`/files/${entityType}/${entityId}`),
    enabled: Boolean(entityType && entityId),
    staleTime: 30_000,
  });
}

export function useDocumentDownloadUrl(id: string, expirySeconds = 3600) {
  return useQuery<DownloadUrlResult>({
    queryKey: [...documentKeys.detail(id), 'download-url', expirySeconds],
    queryFn: () =>
      apiClients.storage.get<DownloadUrlResult>(`/files/${id}/download-url`, {
        params: { expirySeconds },
      }),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation<FileRecord, Error, { file: File; entityType: string; entityId: string }>({
    mutationFn: async ({ file, entityType, entityId }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);
      return apiClients.storage.post<FileRecord>('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: documentKeys.list(vars.entityType, vars.entityId),
      });
      notify.success('Document uploaded');
    },
    onError: (err) => {
      notify.error('Failed to upload document', err.message);
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; entityType: string; entityId: string }>({
    mutationFn: ({ id }) => apiClients.storage.delete<void>(`/files/${id}`),
    onSuccess: (_d, vars) => {
      qc.removeQueries({ queryKey: documentKeys.detail(vars.id) });
      qc.invalidateQueries({
        queryKey: documentKeys.list(vars.entityType, vars.entityId),
      });
      notify.success('Document deleted');
    },
    onError: (err) => {
      notify.error('Failed to delete document', err.message);
    },
  });
}
