import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

/**
 * React Query hooks for the Account-Contact Relationship (ACR) / buying-committee
 * layer. These surface the many-to-many relation between accounts and contacts
 * that crm-service now exposes, independent of a contact's single `accountId`.
 *
 * API contract (reachable via the `api` client, base /bff/crm):
 *   - GET    /accounts/:id/related-contacts
 *   - POST   /accounts/:id/related-contacts
 *   - PATCH  /account-contact-relations/:relId
 *   - DELETE /account-contact-relations/:relId
 *   - GET    /contacts/:id/related-accounts
 *
 * Note: `api.get` unwraps the `{ success, data }` envelope, so these queries
 * resolve to the inner `data` array directly.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type RelationSentiment = 'Positive' | 'Neutral' | 'Negative' | 'Unknown' | string;

export interface RelatedContact {
  id: string;
  contactId: string;
  role: string;
  isPrimary: boolean;
  isDirect: boolean;
  influence?: number | null;
  sentiment?: RelationSentiment | null;
  reportsToContactId?: string | null;
  isChampion: boolean;
  notes?: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
  };
}

export interface RelatedAccount {
  id: string;
  accountId: string;
  role: string;
  isPrimary: boolean;
  account: {
    id: string;
    name: string;
    industry: string | null;
  };
}

export interface CreateRelatedContactInput {
  contactId: string;
  role: string;
  isPrimary?: boolean;
  influence?: number;
  sentiment?: RelationSentiment;
  reportsToContactId?: string;
  isChampion?: boolean;
  notes?: string;
}

export type UpdateRelatedContactInput = Partial<Omit<CreateRelatedContactInput, 'contactId'>>;

// ─── Keys ───────────────────────────────────────────────────────────────────

export const accountRelationKeys = {
  all: ['account-relations'] as const,
  relatedContacts: (accountId: string) =>
    [...accountRelationKeys.all, 'related-contacts', accountId] as const,
  relatedAccounts: (contactId: string) =>
    [...accountRelationKeys.all, 'related-accounts', contactId] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

/** Buying committee / related contacts for an account. */
export function useRelatedContacts(accountId: string) {
  return useQuery<RelatedContact[]>({
    queryKey: accountRelationKeys.relatedContacts(accountId),
    queryFn: () =>
      api.get<RelatedContact[]>(`/accounts/${accountId}/related-contacts`),
    enabled: Boolean(accountId),
    staleTime: 30_000,
  });
}

/** Accounts a contact is related to (shows the contact is not bound to one account). */
export function useRelatedAccounts(contactId: string) {
  return useQuery<RelatedAccount[]>({
    queryKey: accountRelationKeys.relatedAccounts(contactId),
    queryFn: () =>
      api.get<RelatedAccount[]>(`/contacts/${contactId}/related-accounts`),
    enabled: Boolean(contactId),
    staleTime: 30_000,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateRelatedContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation<RelatedContact, Error, CreateRelatedContactInput>({
    mutationFn: (data) =>
      api.post<RelatedContact>(`/accounts/${accountId}/related-contacts`, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: accountRelationKeys.relatedContacts(accountId),
      });
    },
  });
}

export function useUpdateRelatedContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation<
    RelatedContact,
    Error,
    { relationId: string; data: UpdateRelatedContactInput }
  >({
    mutationFn: ({ relationId, data }) =>
      api.patch<RelatedContact>(`/account-contact-relations/${relationId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: accountRelationKeys.relatedContacts(accountId),
      });
    },
  });
}

export function useDeleteRelatedContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (relationId) =>
      api.delete<void>(`/account-contact-relations/${relationId}`),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: accountRelationKeys.relatedContacts(accountId),
      });
    },
  });
}
