import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Marketing Campaigns domain.
 *
 * Backend: campaign-service (`apiClients.campaigns`, base → `/api/v1`).
 * Every endpoint returns the standard `{ success, data }` envelope which the
 * typed client already unwraps, so query functions receive the inner `data`.
 * NOTE: list/members endpoints also return a top-level `pagination` object, but
 * `unwrap()` only surfaces `data` (the items array) — pagination is driven
 * client-side via a page-length heuristic.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type CampaignType = 'EMAIL' | 'SOCIAL' | 'EVENT' | 'WEBINAR' | 'PAID' | 'OTHER';
export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ARCHIVED';
export type MemberEntity = 'LEAD' | 'CONTACT';
export type MemberStatus =
  | 'PENDING'
  | 'SENT'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'UNSUBSCRIBED'
  | 'CONVERTED';

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  subject?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  contentHtml?: string | null;
  templateId?: string | null;
  scheduledAt?: string | null;
  budget?: number | null;
  ownerId: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface CampaignMember {
  id: string;
  tenantId: string;
  campaignId: string;
  entityType: MemberEntity;
  entityId: string;
  email: string;
  status: MemberStatus;
  createdAt: string;
  sentAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
}

export interface CampaignMetrics {
  campaignId: string;
  status: CampaignStatus;
  total: number;
  counts: Record<MemberStatus, number>;
  rates: {
    openRate: number;
    clickRate: number;
    bounceRate: number;
    unsubscribeRate: number;
    conversionRate: number;
    deliveryRate: number;
  };
}

export interface CampaignListFilters {
  type?: CampaignType;
  status?: CampaignStatus;
  ownerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCampaignInput {
  name: string;
  type?: CampaignType;
  subject?: string;
  fromName?: string;
  fromEmail?: string;
  contentHtml?: string;
  templateId?: string;
  scheduledAt?: string;
  budget?: number;
  ownerId: string;
  tags?: string[];
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

export interface MemberInput {
  entityType: MemberEntity;
  entityId: string;
  email: string;
}

// ─── Query-key factory ──────────────────────────────────────────────────────

export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
  list: (f: CampaignListFilters) => [...campaignKeys.lists(), f] as const,
  details: () => [...campaignKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
  members: (id: string, status?: string) =>
    [...campaignKeys.detail(id), 'members', status ?? 'all'] as const,
  metrics: (id: string) => [...campaignKeys.detail(id), 'metrics'] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

export function useCampaigns(filters: CampaignListFilters = {}) {
  const params: Record<string, unknown> = {};
  if (filters.type) params.type = filters.type;
  if (filters.status) params.status = filters.status;
  if (filters.ownerId) params.ownerId = filters.ownerId;
  if (filters.search) params.search = filters.search;
  params.page = filters.page ?? 1;
  params.limit = filters.limit ?? 20;

  return useQuery<Campaign[]>({
    queryKey: campaignKeys.list(filters),
    queryFn: () => apiClients.campaigns.get<Campaign[]>('/campaigns', { params }),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCampaign(id: string) {
  return useQuery<Campaign>({
    queryKey: campaignKeys.detail(id),
    queryFn: () => apiClients.campaigns.get<Campaign>(`/campaigns/${id}`),
    enabled: Boolean(id),
  });
}

export function useCampaignMembers(id: string, status?: MemberStatus) {
  return useQuery<CampaignMember[]>({
    queryKey: campaignKeys.members(id, status),
    queryFn: () => {
      const params: Record<string, unknown> = { page: 1, limit: 200 };
      if (status) params.status = status;
      return apiClients.campaigns.get<CampaignMember[]>(
        `/campaigns/${id}/members`,
        { params }
      );
    },
    enabled: Boolean(id),
  });
}

export function useCampaignMetrics(id: string) {
  return useQuery<CampaignMetrics>({
    queryKey: campaignKeys.metrics(id),
    queryFn: () => apiClients.campaigns.get<CampaignMetrics>(`/campaigns/${id}/metrics`),
    enabled: Boolean(id),
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation<Campaign, Error, CreateCampaignInput>({
    mutationFn: (data) => apiClients.campaigns.post<Campaign>('/campaigns', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      notify.success('Campaign created');
    },
    onError: (err) => notify.error('Failed to create campaign', err.message),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation<Campaign, Error, { id: string; data: UpdateCampaignInput }>({
    mutationFn: ({ id, data }) =>
      apiClients.campaigns.patch<Campaign>(`/campaigns/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      notify.success('Campaign updated');
    },
    onError: (err) => notify.error('Failed to update campaign', err.message),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClients.campaigns.delete<void>(`/campaigns/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      notify.success('Campaign deleted');
    },
    onError: (err) => notify.error('Failed to delete campaign', err.message),
  });
}

export function useChangeCampaignStatus() {
  const qc = useQueryClient();
  return useMutation<Campaign, Error, { id: string; status: CampaignStatus }>({
    mutationFn: ({ id, status }) =>
      apiClients.campaigns.post<Campaign>(`/campaigns/${id}/status`, { status }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.metrics(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      notify.success('Campaign status updated');
    },
    onError: (err) => notify.error('Status change failed', err.message),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation<
    { campaign: Campaign; requested: number },
    Error,
    string
  >({
    mutationFn: (id) =>
      apiClients.campaigns.post<{ campaign: Campaign; requested: number }>(
        `/campaigns/${id}/send`
      ),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.metrics(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      notify.success(`Campaign launched — ${res.requested} send(s) requested`);
    },
    onError: (err) => notify.error('Send failed', err.message),
  });
}

export function useAddCampaignMembers() {
  const qc = useQueryClient();
  return useMutation<
    { added: number; requested: number },
    Error,
    { id: string; members: MemberInput[]; bulk?: boolean }
  >({
    mutationFn: ({ id, members, bulk }) =>
      apiClients.campaigns.post<{ added: number; requested: number }>(
        `/campaigns/${id}/members${bulk ? '/import' : ''}`,
        { members }
      ),
    onSuccess: (res, { id }) => {
      qc.invalidateQueries({ queryKey: campaignKeys.members(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.metrics(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      notify.success(`${res.added} member(s) added`);
    },
    onError: (err) => notify.error('Failed to add members', err.message),
  });
}

export function useRemoveCampaignMember() {
  const qc = useQueryClient();
  return useMutation<
    { deleted: boolean },
    Error,
    { id: string; memberId: string }
  >({
    mutationFn: ({ id, memberId }) =>
      apiClients.campaigns.delete<{ deleted: boolean }>(
        `/campaigns/${id}/members/${memberId}`
      ),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: campaignKeys.members(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.metrics(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      notify.success('Member removed');
    },
    onError: (err) => notify.error('Failed to remove member', err.message),
  });
}
