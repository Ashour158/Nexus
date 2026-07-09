'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the generic Approval engine (approval-service).
 *
 * Transport: `apiClients.workflow` — its base URL is the workflow BFF, and
 * next.config.mjs rewrites `/bff/workflow/approval/*` to approval-service
 * (:3014) so the `/approval/*` sub-paths below land on the real engine. All
 * other `/bff/workflow/*` paths continue to hit workflow-service (:3007).
 *
 * Contracts (approval-service `src/routes`):
 *   GET    /approval/requests            ?status&module&recordId&page&limit
 *   GET    /approval/requests/mine       ?page&limit
 *   GET    /approval/requests/:id        (steps + policy)
 *   POST   /approval/requests/:id/approve|reject|delegate|cancel
 *   GET    /approval/policies            ?module
 *   POST   /approval/policies
 *   PATCH  /approval/policies/:id
 *   DELETE /approval/policies/:id
 */

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'CANCELLED';
export type StepStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED' | 'DELEGATED';
export type QuorumMode = 'ALL' | 'ANY' | 'N_OF_M';
export type ApproverType = 'USER' | 'ROLE' | 'MANAGER';

export interface ApprovalStep {
  id: string;
  requestId: string;
  order: number;
  approverId: string;
  status: StepStatus;
  comment?: string | null;
  actionedAt?: string | null;
  createdAt: string;
  quorumMode: QuorumMode;
  quorumSize?: number | null;
}

/** Shape of one entry in a policy's `steps` JSON array. */
export interface PolicyStep {
  order: number;
  approverType: ApproverType;
  approverId?: string;
  role?: string;
  canDelegate?: boolean;
  quorumMode?: QuorumMode;
  quorumSize?: number;
}

export interface ApprovalPolicy {
  id: string;
  tenantId: string;
  name: string;
  module: string;
  conditions: Record<string, unknown>;
  steps: PolicyStep[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  policyId: string;
  module: string;
  recordId: string;
  requestedBy: string;
  status: ApprovalStatus;
  currentStep: number;
  data?: Record<string, unknown> | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  steps?: ApprovalStep[];
  policy?: ApprovalPolicy | null;
}

export interface ApprovalListResult {
  data: ApprovalRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface ApprovalFilters {
  status?: ApprovalStatus;
  module?: string;
  recordId?: string;
  page?: number;
  limit?: number;
}

export interface PolicyInput {
  name: string;
  module: string;
  conditions?: Record<string, unknown>;
  steps?: PolicyStep[];
  isActive?: boolean;
}

export const approvalKeys = {
  all: ['approvals'] as const,
  lists: () => [...approvalKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...approvalKeys.lists(), f] as const,
  mine: (f: Record<string, unknown>) => [...approvalKeys.all, 'mine', f] as const,
  detail: (id: string) => [...approvalKeys.all, 'detail', id] as const,
  policies: (module?: string) => [...approvalKeys.all, 'policies', module ?? 'all'] as const,
};

const wf = apiClients.workflow;

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useApprovalRequests(filters: ApprovalFilters = {}) {
  const params: Record<string, unknown> = {
    status: filters.status,
    module: filters.module,
    recordId: filters.recordId,
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
  };
  return useQuery<ApprovalListResult>({
    queryKey: approvalKeys.list(params),
    queryFn: () => wf.get<ApprovalListResult>('/approval/requests', { params }),
    retry: 1,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useMyApprovals(page = 1, limit = 25) {
  const params = { page, limit };
  return useQuery<ApprovalListResult>({
    queryKey: approvalKeys.mine(params),
    queryFn: () => wf.get<ApprovalListResult>('/approval/requests/mine', { params }),
    retry: 1,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useApprovalRequest(id: string | null) {
  return useQuery<ApprovalRequest>({
    queryKey: approvalKeys.detail(id ?? ''),
    queryFn: () => wf.get<ApprovalRequest>(`/approval/requests/${id}`),
    enabled: Boolean(id),
    retry: 1,
  });
}

export function useApprovalPolicies(module?: string) {
  return useQuery<ApprovalPolicy[]>({
    queryKey: approvalKeys.policies(module),
    queryFn: () =>
      wf.get<ApprovalPolicy[]>('/approval/policies', {
        params: module ? { module } : undefined,
      }),
    retry: 1,
    staleTime: 30_000,
  });
}

// ─── Request mutations ─────────────────────────────────────────────────────────

function useInvalidateApprovals() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: approvalKeys.all });
}

export function useApproveRequest() {
  const invalidate = useInvalidateApprovals();
  return useMutation<ApprovalRequest, Error, { id: string; comment?: string }>({
    mutationFn: ({ id, comment }) =>
      wf.post<ApprovalRequest>(`/approval/requests/${id}/approve`, { comment }),
    onSuccess: () => {
      void invalidate();
      notify.success('Approval recorded');
    },
    onError: (err) => notify.error('Approve failed', err.message),
  });
}

export function useRejectRequest() {
  const invalidate = useInvalidateApprovals();
  return useMutation<ApprovalRequest, Error, { id: string; comment: string }>({
    mutationFn: ({ id, comment }) =>
      wf.post<ApprovalRequest>(`/approval/requests/${id}/reject`, { comment }),
    onSuccess: () => {
      void invalidate();
      notify.success('Request rejected');
    },
    onError: (err) => notify.error('Reject failed', err.message),
  });
}

export function useDelegateRequest() {
  const invalidate = useInvalidateApprovals();
  return useMutation<ApprovalRequest, Error, { id: string; delegateTo: string; comment?: string }>({
    mutationFn: ({ id, delegateTo, comment }) =>
      wf.post<ApprovalRequest>(`/approval/requests/${id}/delegate`, { delegateTo, comment }),
    onSuccess: () => {
      void invalidate();
      notify.success('Approval delegated');
    },
    onError: (err) => notify.error('Delegate failed', err.message),
  });
}

export function useCancelRequest() {
  const invalidate = useInvalidateApprovals();
  return useMutation<ApprovalRequest, Error, { id: string }>({
    mutationFn: ({ id }) => wf.post<ApprovalRequest>(`/approval/requests/${id}/cancel`),
    onSuccess: () => {
      void invalidate();
      notify.success('Request cancelled');
    },
    onError: (err) => notify.error('Cancel failed', err.message),
  });
}

// ─── Policy mutations ──────────────────────────────────────────────────────────

export function useCreatePolicy() {
  const invalidate = useInvalidateApprovals();
  return useMutation<ApprovalPolicy, Error, PolicyInput>({
    mutationFn: (input) => wf.post<ApprovalPolicy>('/approval/policies', input),
    onSuccess: () => {
      void invalidate();
      notify.success('Policy created');
    },
    onError: (err) => notify.error('Create policy failed', err.message),
  });
}

export function useUpdatePolicy() {
  const invalidate = useInvalidateApprovals();
  return useMutation<ApprovalPolicy, Error, { id: string; input: Partial<PolicyInput> }>({
    mutationFn: ({ id, input }) => wf.patch<ApprovalPolicy>(`/approval/policies/${id}`, input),
    onSuccess: () => {
      void invalidate();
      notify.success('Policy updated');
    },
    onError: (err) => notify.error('Update policy failed', err.message),
  });
}

export function useDeletePolicy() {
  const invalidate = useInvalidateApprovals();
  return useMutation<ApprovalPolicy, Error, { id: string }>({
    mutationFn: ({ id }) => wf.delete<ApprovalPolicy>(`/approval/policies/${id}`),
    onSuccess: () => {
      void invalidate();
      notify.success('Policy deactivated');
    },
    onError: (err) => notify.error('Delete policy failed', err.message),
  });
}
