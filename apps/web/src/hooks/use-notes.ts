import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { Note, PaginatedResult } from '@nexus/shared-types';
import type { CreateNoteInput, UpdateNoteInput } from '@nexus/validation';
import { api } from '@/lib/api-client';

/**
 * React Query hooks for the Notes domain — Section 39.1.
 */

export interface NoteListFilters {
  page?: number;
  limit?: number;
  dealId?: string;
  contactId?: string;
  leadId?: string;
  accountId?: string;
  authorId?: string;
  isPinned?: boolean;
}

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...noteKeys.lists(), f] as const,
  details: () => [...noteKeys.all, 'detail'] as const,
  detail: (id: string) => [...noteKeys.details(), id] as const,
  forDeal: (dealId: string) => [...noteKeys.all, 'deal', dealId] as const,
  forContact: (id: string) => [...noteKeys.all, 'contact', id] as const,
  forLead: (id: string) => [...noteKeys.all, 'lead', id] as const,
};

type NoteListResponse = PaginatedResult<Note>;

export function useNotes(filters: NoteListFilters = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    dealId: filters.dealId,
    contactId: filters.contactId,
    leadId: filters.leadId,
    accountId: filters.accountId,
    authorId: filters.authorId,
    isPinned: filters.isPinned,
  };
  return useQuery<NoteListResponse>({
    queryKey: noteKeys.list(normalized),
    queryFn: () => api.get<NoteListResponse>('/notes', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useNote(id: string) {
  return useQuery<Note>({
    queryKey: noteKeys.detail(id),
    queryFn: () => api.get<Note>(`/notes/${id}`),
    enabled: Boolean(id),
  });
}

export function useDealNotes(
  dealId: string,
  pagination: { page?: number; limit?: number } = {}
) {
  const normalized = {
    page: pagination.page ?? 1,
    limit: pagination.limit ?? 50,
  };
  return useQuery<NoteListResponse>({
    queryKey: [...noteKeys.forDeal(dealId), normalized] as QueryKey,
    queryFn: () =>
      api.get<NoteListResponse>(`/deals/${dealId}/notes`, {
        params: normalized,
      }),
    enabled: Boolean(dealId),
    staleTime: 15_000,
  });
}

export function useContactNotes(contactId: string) {
  return useQuery<NoteListResponse>({
    queryKey: noteKeys.forContact(contactId),
    queryFn: () => api.get<NoteListResponse>(`/contacts/${contactId}/notes`),
    enabled: Boolean(contactId),
  });
}

export function useLeadNotes(leadId: string) {
  return useQuery<NoteListResponse>({
    queryKey: noteKeys.forLead(leadId),
    queryFn: () => api.get<NoteListResponse>(`/leads/${leadId}/notes`),
    enabled: Boolean(leadId),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation<Note, Error, CreateNoteInput>({
    mutationFn: (data) => api.post<Note>('/notes', data),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: noteKeys.lists() });
      if (note.dealId) {
        qc.invalidateQueries({ queryKey: noteKeys.forDeal(note.dealId) });
      }
      if (note.contactId) {
        qc.invalidateQueries({ queryKey: noteKeys.forContact(note.contactId) });
      }
      if (note.leadId) {
        qc.invalidateQueries({ queryKey: noteKeys.forLead(note.leadId) });
      }
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation<Note, Error, { id: string; data: UpdateNoteInput }>({
    mutationFn: ({ id, data }) => api.patch<Note>(`/notes/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(id) });
      qc.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete<void>(`/notes/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: noteKeys.detail(id) });
      qc.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function usePinNote() {
  const qc = useQueryClient();
  return useMutation<Note, Error, { id: string; pinned: boolean }>({
    mutationFn: ({ id, pinned }) =>
      pinned
        ? api.post<Note>(`/notes/${id}/pin`)
        : api.delete<Note>(`/notes/${id}/pin`),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(id) });
      qc.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
