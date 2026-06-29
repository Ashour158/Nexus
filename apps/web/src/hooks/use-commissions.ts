import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { PaginatedResult } from '@nexus/shared-types';
import type { CommissionListQuery, ClawbackCommissionInput } from '@nexus/validation';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Finance/Commissions domain.
 */

export interface Commission {
  id: string;
  tenantId: string;
  userId: string;
  dealId: string;
  baseAmount: string;
  finalAmount: string;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'DISPUTED' | 'CLAWED_BACK';
  approvedAt?: string | null;
  approvedBy?: string | null;
  clawbackReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionSummary {
  userId: string;
  totalCommissions: number;
  totalApproved: number;
  totalPaid: number;
  totalPending: number;
  year: number;
  quarter?: number;
}

type CommissionListResponse = PaginatedResult<Commission>;

export const commissionKeys = {
  all: ['commissions'] as const,
  lists: () => [...commissionKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...commissionKeys.lists(), f] as const,
  summaries: () => [...commissionKeys.all, 'summary'] as const,
  summary: (f: Record<string, unknown>) => [...commissionKeys.summaries(), f] as const,
};

export function useCommissions(filters: Omit<CommissionListQuery, 'page' | 'limit' | 'sortDir'> & { page?: number; limit?: number } = {}) {
  const normalized: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    ownerId: filters.ownerId,
    userId: filters.userId,
    status: filters.status,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
  return useQuery<CommissionListResponse>({
    queryKey: commissionKeys.list(normalized),
    queryFn: () =>
      apiClients.finance.get<CommissionListResponse>('/commissions', {
        params: normalized,
      }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useCommissionSummary(filters: { ownerId: string; year: number; quarter?: number }) {
  const normalized: Record<string, unknown> = {
    ownerId: filters.ownerId,
    year: filters.year,
    quarter: filters.quarter,
  };
  return useQuery<CommissionSummary>({
    queryKey: commissionKeys.summary(normalized),
    queryFn: () =>
      apiClients.finance.get<CommissionSummary>('/commissions/summary', {
        params: normalized,
      }),
    enabled: Boolean(filters.ownerId),
    staleTime: 60_000,
  });
}

export function useApproveCommission() {
  const qc = useQueryClient();
  return useMutation<Commission, Error, string>({
    mutationFn: (id) => apiClients.finance.post<Commission>(`/commissions/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.lists() });
      qc.invalidateQueries({ queryKey: commissionKeys.summaries() });
      notify.success('Commission approved');
    },
    onError: (err) => {
      notify.error('Failed to approve commission', err.message);
    },
  });
}

export function useClawbackCommission() {
  const qc = useQueryClient();
  return useMutation<Commission, Error, { id: string; data: ClawbackCommissionInput }>({
    mutationFn: ({ id, data }) =>
      apiClients.finance.post<Commission>(`/commissions/${id}/clawback`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.lists() });
      qc.invalidateQueries({ queryKey: commissionKeys.summaries() });
      notify.success('Commission clawed back');
    },
    onError: (err) => {
      notify.error('Failed to clawback commission', err.message);
    },
  });
}
