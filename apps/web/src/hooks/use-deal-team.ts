import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for Deal team members and revenue splits.
 *
 * Backed by crm-service endpoints (base `/bff/crm` in dev via the `api`
 * client):
 *   GET    /deals/:id/team
 *   POST   /deals/:id/team
 *   PATCH  /deal-team/:id
 *   DELETE /deal-team/:id
 */

export type SplitType = 'revenue' | 'overlay';

export interface DealTeamMember {
  id: string;
  userId: string;
  role: string;
  splitPercent: number;
  splitType: SplitType;
}

export interface CreateDealTeamInput {
  userId: string;
  role: string;
  splitPercent?: number;
  splitType?: SplitType;
}

export type UpdateDealTeamInput = Partial<CreateDealTeamInput>;

export const dealTeamKeys = {
  all: ['deal-team'] as const,
  forDeal: (dealId: string) => [...dealTeamKeys.all, dealId] as const,
};

export function useDealTeam(dealId: string) {
  return useQuery<DealTeamMember[]>({
    queryKey: dealTeamKeys.forDeal(dealId),
    queryFn: () => api.get<DealTeamMember[]>(`/deals/${dealId}/team`),
    enabled: Boolean(dealId),
    staleTime: 30_000,
    // Endpoint may 404 until the backend deploys — don't hammer it.
    retry: false,
  });
}

export function useAddDealTeamMember(dealId: string) {
  const qc = useQueryClient();
  return useMutation<DealTeamMember, Error, CreateDealTeamInput>({
    mutationFn: (data) => api.post<DealTeamMember>(`/deals/${dealId}/team`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealTeamKeys.forDeal(dealId) });
      notify.success('Team member added');
    },
    onError: (err) => notify.error('Failed to add team member', err.message),
  });
}

export function useUpdateDealTeamMember(dealId: string) {
  const qc = useQueryClient();
  return useMutation<DealTeamMember, Error, { id: string; data: UpdateDealTeamInput }>({
    mutationFn: ({ id, data }) => api.patch<DealTeamMember>(`/deal-team/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealTeamKeys.forDeal(dealId) }),
    onError: (err) => notify.error('Failed to update team member', err.message),
  });
}

export function useRemoveDealTeamMember(dealId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete<void>(`/deal-team/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealTeamKeys.forDeal(dealId) });
      notify.success('Team member removed');
    },
    onError: (err) => notify.error('Failed to remove team member', err.message),
  });
}
