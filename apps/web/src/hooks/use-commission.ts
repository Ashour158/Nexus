import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Commission Engine (incentive-service).
 *
 * NOTE: distinct from `use-commissions.ts`, which targets the legacy
 * finance-service commissions (clawbacks etc.). This module drives the
 * plan/rule/statement engine that computes commission from `deal.won`.
 */

export type CommissionBasis = 'REVENUE' | 'MARGIN';
export type CommissionStatementStatus = 'PENDING' | 'APPROVED' | 'PAID';

export interface CommissionRule {
  id: string;
  planId: string;
  tenantId: string;
  appliesToRole: string | null;
  ownerId: string | null;
  productId: string | null;
  ratePercent: string;
  tierMinAmount: string | null;
  tierMaxAmount: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionPlan {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  basis: CommissionBasis;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  rules: CommissionRule[];
}

export interface CommissionStatement {
  id: string;
  tenantId: string;
  ownerId: string;
  dealId: string;
  planId: string | null;
  ruleId: string | null;
  baseAmount: string;
  ratePercent: string;
  commissionAmount: string;
  currency: string;
  status: CommissionStatementStatus;
  periodMonth: string;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleInput {
  appliesToRole?: string;
  ownerId?: string;
  productId?: string;
  ratePercent: string | number;
  tierMinAmount?: string | number;
  tierMaxAmount?: string | number;
  priority?: number;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  isActive?: boolean;
  basis?: CommissionBasis;
  effectiveFrom?: string;
  effectiveTo?: string;
  rules?: CreateRuleInput[];
}

export interface StatementFilters {
  ownerId?: string;
  periodMonth?: string;
  status?: CommissionStatementStatus;
}

export const commissionKeys = {
  all: ['commission'] as const,
  plans: () => [...commissionKeys.all, 'plans'] as const,
  statements: (f: StatementFilters) => [...commissionKeys.all, 'statements', f] as const,
};

// ── Plans + rules ──────────────────────────────────────────────────────────
export function useCommissionPlans() {
  return useQuery<CommissionPlan[]>({
    queryKey: commissionKeys.plans(),
    queryFn: () => apiClients.incentive.get<CommissionPlan[]>('/commission/plans'),
    staleTime: 30_000,
  });
}

export function useCreateCommissionPlan() {
  const qc = useQueryClient();
  return useMutation<CommissionPlan, Error, CreatePlanInput>({
    mutationFn: (input) => apiClients.incentive.post<CommissionPlan>('/commission/plans', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.plans() });
      notify.success('Commission plan created');
    },
    onError: (err) => notify.error('Failed to create plan', err.message),
  });
}

export function useUpdateCommissionPlan() {
  const qc = useQueryClient();
  return useMutation<CommissionPlan, Error, { id: string; data: Partial<CreatePlanInput> }>({
    mutationFn: ({ id, data }) => apiClients.incentive.patch<CommissionPlan>(`/commission/plans/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.plans() });
      notify.success('Commission plan updated');
    },
    onError: (err) => notify.error('Failed to update plan', err.message),
  });
}

export function useDeleteCommissionPlan() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) => apiClients.incentive.delete<{ id: string }>(`/commission/plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.plans() });
      notify.success('Commission plan deleted');
    },
    onError: (err) => notify.error('Failed to delete plan', err.message),
  });
}

export function useAddCommissionRule() {
  const qc = useQueryClient();
  return useMutation<CommissionRule, Error, { planId: string; data: CreateRuleInput }>({
    mutationFn: ({ planId, data }) =>
      apiClients.incentive.post<CommissionRule>(`/commission/plans/${planId}/rules`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.plans() });
      notify.success('Rule added');
    },
    onError: (err) => notify.error('Failed to add rule', err.message),
  });
}

export function useDeleteCommissionRule() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (ruleId) => apiClients.incentive.delete<{ id: string }>(`/commission/rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.plans() });
      notify.success('Rule removed');
    },
    onError: (err) => notify.error('Failed to remove rule', err.message),
  });
}

// ── Statements ───────────────────────────────────────────────────────────
export function useCommissionStatements(filters: StatementFilters = {}) {
  return useQuery<CommissionStatement[]>({
    queryKey: commissionKeys.statements(filters),
    queryFn: () =>
      apiClients.incentive.get<CommissionStatement[]>('/commission/statements', {
        params: {
          ownerId: filters.ownerId,
          periodMonth: filters.periodMonth,
          status: filters.status,
        },
      }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useApproveStatement() {
  const qc = useQueryClient();
  return useMutation<CommissionStatement, Error, string>({
    mutationFn: (id) => apiClients.incentive.post<CommissionStatement>(`/commission/statements/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...commissionKeys.all, 'statements'] });
      notify.success('Statement approved');
    },
    onError: (err) => notify.error('Failed to approve statement', err.message),
  });
}

export function usePayStatement() {
  const qc = useQueryClient();
  return useMutation<CommissionStatement, Error, string>({
    mutationFn: (id) => apiClients.incentive.post<CommissionStatement>(`/commission/statements/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...commissionKeys.all, 'statements'] });
      notify.success('Statement marked paid');
    },
    onError: (err) => notify.error('Failed to pay statement', err.message),
  });
}
