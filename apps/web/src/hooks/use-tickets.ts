import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for the Tickets / Cases domain — ticket-service.
 *
 * All hooks delegate to the typed tickets client (`apiClients.tickets`), whose
 * base resolves to `/bff/tickets` → ticket-service `/api/v1`. The client
 * unwraps the `{ success, data }` envelope, so list endpoints (which the
 * service serializes as `{ success, data: [...], total, page, limit }`) hand
 * back the row array directly — pagination is therefore driven by a
 * "returned a full page ⇒ maybe more" heuristic rather than a server total.
 */

// ─── Enums / literals (mirror ticket-service prisma + state machine) ─────────

export type TicketStatus = 'NEW' | 'OPEN' | 'PENDING' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketChannel = 'EMAIL' | 'WEB' | 'PHONE' | 'CHAT' | 'API';

export const TICKET_STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
export const TICKET_PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const TICKET_CHANNELS: TicketChannel[] = ['EMAIL', 'WEB', 'PHONE', 'CHAT', 'API'];

/**
 * Allowed forward/reopen transitions — mirrors ticket-service
 * `lib/state-machine.ts` so the status dropdown only offers legal moves.
 */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  OPEN: ['PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  PENDING: ['OPEN', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  ON_HOLD: ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

export function allowedNextStatuses(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isReopen(from: TicketStatus, to: TicketStatus): boolean {
  return (from === 'RESOLVED' || from === 'CLOSED') && to === 'OPEN';
}

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  tenantId: string;
  number: string;
  subject: string;
  description?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  type?: string | null;
  channel: TicketChannel;
  requesterContactId?: string | null;
  requesterEmail?: string | null;
  accountId?: string | null;
  assigneeId?: string | null;
  teamId?: string | null;
  slaPolicyId?: string | null;
  firstResponseDueAt?: string | null;
  resolutionDueAt?: string | null;
  firstRespondedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  slaBreached: boolean;
  reopenCount: number;
  tags: string[];
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface TicketComment {
  id: string;
  tenantId: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  tenantId: string;
  ticketId: string;
  type: string;
  actorId?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface SlaPolicy {
  id: string;
  tenantId: string;
  name: string;
  priority?: TicketPriority | null;
  firstResponseMins: number;
  resolutionMins: number;
  businessHoursOnly: boolean;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  accountId?: string;
  requesterContactId?: string;
  requesterEmail?: string;
  teamId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateTicketInput {
  subject: string;
  description?: string;
  priority?: TicketPriority;
  type?: string;
  channel?: TicketChannel;
  requesterContactId?: string;
  requesterEmail?: string;
  accountId?: string;
  assigneeId?: string;
  teamId?: string;
  tags?: string[];
}

export type UpdateTicketInput = Partial<{
  subject: string;
  description: string | null;
  priority: TicketPriority;
  type: string | null;
  tags: string[];
  requesterContactId: string | null;
  requesterEmail: string | null;
  accountId: string | null;
}>;

export interface CreateSlaPolicyInput {
  name: string;
  priority?: TicketPriority | null;
  firstResponseMins: number;
  resolutionMins: number;
  businessHoursOnly?: boolean;
  isDefault?: boolean;
  active?: boolean;
}

// ─── Query-key factory ───────────────────────────────────────────────────────

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (f: Record<string, unknown>) => [...ticketKeys.lists(), f] as const,
  details: () => [...ticketKeys.all, 'detail'] as const,
  detail: (id: string) => [...ticketKeys.details(), id] as const,
  comments: (id: string) => [...ticketKeys.detail(id), 'comments'] as const,
  history: (id: string) => [...ticketKeys.detail(id), 'history'] as const,
  slaPolicies: () => [...ticketKeys.all, 'sla-policies'] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Paginated ticket list. The typed client unwraps to the row array; `total`
 * from the envelope is not preserved, so callers page with the returned length
 * (a full page ⇒ there may be more).
 */
export function useTickets(filters: TicketFilters = {}) {
  const normalized: Record<string, unknown> = {
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    assigneeId: filters.assigneeId || undefined,
    accountId: filters.accountId || undefined,
    requesterContactId: filters.requesterContactId || undefined,
    requesterEmail: filters.requesterEmail || undefined,
    teamId: filters.teamId || undefined,
    search: filters.search?.trim() || undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
  };
  return useQuery<Ticket[]>({
    queryKey: ticketKeys.list(normalized),
    queryFn: () => apiClients.tickets.get<Ticket[]>('/tickets', { params: normalized }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useTicket(id: string) {
  return useQuery<Ticket>({
    queryKey: ticketKeys.detail(id),
    queryFn: () => apiClients.tickets.get<Ticket>(`/tickets/${id}`),
    enabled: Boolean(id),
  });
}

export function useTicketComments(id: string) {
  return useQuery<TicketComment[]>({
    queryKey: ticketKeys.comments(id),
    queryFn: () => apiClients.tickets.get<TicketComment[]>(`/tickets/${id}/comments`),
    enabled: Boolean(id),
  });
}

export function useTicketHistory(id: string) {
  return useQuery<TicketEvent[]>({
    queryKey: ticketKeys.history(id),
    queryFn: () => apiClients.tickets.get<TicketEvent[]>(`/tickets/${id}/history`),
    enabled: Boolean(id),
  });
}

export function useSlaPolicies() {
  return useQuery<SlaPolicy[]>({
    queryKey: ticketKeys.slaPolicies(),
    queryFn: () => apiClients.tickets.get<SlaPolicy[]>('/sla-policies'),
    staleTime: 60_000,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, Error, CreateTicketInput>({
    mutationFn: (data) => apiClients.tickets.post<Ticket>('/tickets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.lists() });
      notify.success('Ticket created');
    },
    onError: (err) => notify.error('Failed to create ticket', err.message),
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, Error, { id: string; data: UpdateTicketInput }>({
    mutationFn: ({ id, data }) => apiClients.tickets.patch<Ticket>(`/tickets/${id}`, data),
    onSuccess: (_t, { id }) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ticketKeys.lists() });
      notify.success('Ticket updated');
    },
    onError: (err) => notify.error('Failed to update ticket', err.message),
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation<{ id: string; deleted: boolean }, Error, string>({
    mutationFn: (id) => apiClients.tickets.delete<{ id: string; deleted: boolean }>(`/tickets/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ticketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ticketKeys.lists() });
      notify.success('Ticket deleted');
    },
    onError: (err) => notify.error('Failed to delete ticket', err.message),
  });
}

export function useRestoreTicket() {
  const qc = useQueryClient();
  return useMutation<{ id: string; restored: boolean }, Error, string>({
    mutationFn: (id) => apiClients.tickets.post<{ id: string; restored: boolean }>(`/tickets/${id}/restore`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ticketKeys.lists() });
      notify.success('Ticket restored');
    },
    onError: (err) => notify.error('Failed to restore ticket', err.message),
  });
}

export function useAssignTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, Error, { id: string; assigneeId?: string | null; teamId?: string }>({
    mutationFn: ({ id, assigneeId, teamId }) =>
      apiClients.tickets.post<Ticket>(`/tickets/${id}/assign`, {
        // Send the key whenever the caller provided it (even '' → null) so
        // "Unassigned" clears the assignee; omit only when undefined.
        ...(assigneeId !== undefined ? { assigneeId: assigneeId || null } : {}),
        ...(teamId ? { teamId } : {}),
      }),
    onSuccess: (_t, { id }) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ticketKeys.lists() });
      qc.invalidateQueries({ queryKey: ticketKeys.history(id) });
      notify.success('Ticket assigned');
    },
    onError: (err) => notify.error('Failed to assign ticket', err.message),
  });
}

export function useTransitionTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, Error, { id: string; status: TicketStatus }>({
    mutationFn: ({ id, status }) =>
      apiClients.tickets.post<Ticket>(`/tickets/${id}/transition`, { status }),
    onSuccess: (_t, { id }) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ticketKeys.lists() });
      qc.invalidateQueries({ queryKey: ticketKeys.history(id) });
      notify.success('Status updated');
    },
    onError: (err) => notify.error('Failed to change status', err.message),
  });
}

export function useAddTicketComment() {
  const qc = useQueryClient();
  return useMutation<TicketComment, Error, { id: string; body: string; isInternal?: boolean }>({
    mutationFn: ({ id, body, isInternal }) =>
      apiClients.tickets.post<TicketComment>(`/tickets/${id}/comments`, {
        body,
        isInternal: isInternal ?? false,
      }),
    onSuccess: (_c, { id }) => {
      qc.invalidateQueries({ queryKey: ticketKeys.comments(id) });
      qc.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ticketKeys.history(id) });
    },
    onError: (err) => notify.error('Failed to add comment', err.message),
  });
}

// ─── SLA policy mutations ──────────────────────────────────────────────────────

export function useCreateSlaPolicy() {
  const qc = useQueryClient();
  return useMutation<SlaPolicy, Error, CreateSlaPolicyInput>({
    mutationFn: (data) => apiClients.tickets.post<SlaPolicy>('/sla-policies', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.slaPolicies() });
      notify.success('SLA policy created');
    },
    onError: (err) => notify.error('Failed to create SLA policy', err.message),
  });
}

export function useUpdateSlaPolicy() {
  const qc = useQueryClient();
  return useMutation<SlaPolicy, Error, { id: string; data: Partial<CreateSlaPolicyInput> }>({
    mutationFn: ({ id, data }) => apiClients.tickets.patch<SlaPolicy>(`/sla-policies/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.slaPolicies() });
      notify.success('SLA policy updated');
    },
    onError: (err) => notify.error('Failed to update SLA policy', err.message),
  });
}

export function useDeleteSlaPolicy() {
  const qc = useQueryClient();
  return useMutation<{ id: string; deleted: boolean }, Error, string>({
    mutationFn: (id) => apiClients.tickets.delete<{ id: string; deleted: boolean }>(`/sla-policies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.slaPolicies() });
      notify.success('SLA policy deleted');
    },
    onError: (err) => notify.error('Failed to delete SLA policy', err.message),
  });
}
