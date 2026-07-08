'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Lock, MessageSquare, History as HistoryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/avatar';
import { TicketStatusPill, TicketPriorityPill, SlaBreachBadge } from '@/components/tickets/ticket-pills';
import { useUsers } from '@/hooks/use-users';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  useTicket,
  useTicketComments,
  useTicketHistory,
  useTransitionTicket,
  useAssignTicket,
  useAddTicketComment,
  allowedNextStatuses,
  type TicketStatus,
  type TicketEvent,
} from '@/hooks/use-tickets';

type Tab = 'comments' | 'history';

const fieldStyle = { borderColor: 'var(--border-color)', color: 'var(--text-primary)' } as const;

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const [tab, setTab] = useState<Tab>('comments');

  const ticketQuery = useTicket(ticketId);
  const usersQuery = useUsers({ limit: 200 });
  const users = usersQuery.data?.data ?? [];
  const userName = (id?: string | null) => {
    if (!id) return '—';
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : id;
  };

  const transition = useTransitionTicket();
  const assign = useAssignTicket();

  const ticket = ticketQuery.data;

  if (ticketQuery.isLoading) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (ticketQuery.isError || !ticket) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <EmptyState
          icon="🎫"
          title="Ticket not found"
          description="This ticket may have been deleted or you may not have access."
          cta={{ label: 'Back to tickets', href: '/tickets' }}
        />
      </main>
    );
  }

  const nextStatuses = allowedNextStatuses(ticket.status);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Link
        href="/tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm hover:underline"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" /> Tickets
      </Link>

      {/* Header */}
      <div
        className="mb-6 rounded-xl border p-5"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-mono">{ticket.number}</span>
              <span>·</span>
              <span>{ticket.channel}</span>
              {ticket.reopenCount > 0 ? (
                <>
                  <span>·</span>
                  <span>Reopened {ticket.reopenCount}×</span>
                </>
              ) : null}
            </div>
            <h1 className="mt-1 text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {ticket.subject}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TicketStatusPill status={ticket.status} />
              <TicketPriorityPill priority={ticket.priority} />
              <SlaBreachBadge breached={ticket.slaBreached} />
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2">
            {/* Transition control */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} htmlFor="status-select">
                Change status
              </label>
              <select
                id="status-select"
                className="h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
                style={fieldStyle}
                value=""
                disabled={transition.isPending || nextStatuses.length === 0}
                onChange={(e) => {
                  const to = e.target.value as TicketStatus;
                  if (to) transition.mutate({ id: ticket.id, status: to });
                }}
              >
                <option value="">{nextStatuses.length ? 'Select…' : 'No moves'}</option>
                {nextStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                    {s === 'OPEN' && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') ? ' (reopen)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {/* Assign control */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} htmlFor="assignee-select">
                Assignee
              </label>
              <select
                id="assignee-select"
                className="h-9 min-w-[180px] rounded-lg border bg-transparent px-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
                style={fieldStyle}
                value={ticket.assigneeId ?? ''}
                disabled={assign.isPending}
                onChange={(e) => {
                  const assigneeId = e.target.value;
                  if (assigneeId) assign.mutate({ id: ticket.id, assigneeId });
                }}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column: description + tabs */}
        <div className="lg:col-span-2">
          {ticket.description ? (
            <div
              className="mb-6 rounded-xl border p-5"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
            >
              <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Description
              </h2>
              <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                {ticket.description}
              </p>
            </div>
          ) : null}

          <div
            className="rounded-xl border"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
          >
            <div className="flex gap-1 border-b px-2" style={{ borderColor: 'var(--border-color)' }}>
              <TabButton active={tab === 'comments'} onClick={() => setTab('comments')}>
                <MessageSquare className="h-4 w-4" /> Comments
              </TabButton>
              <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
                <HistoryIcon className="h-4 w-4" /> History
              </TabButton>
            </div>
            <div className="p-5">
              {tab === 'comments' ? (
                <CommentsTab ticketId={ticket.id} userName={userName} />
              ) : (
                <HistoryTab ticketId={ticket.id} userName={userName} />
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: requester / account / SLA */}
        <aside className="space-y-4">
          <InfoCard title="Requester & account">
            <InfoRow label="Requester email" value={ticket.requesterEmail ?? '—'} />
            <InfoRow label="Requester contact" value={ticket.requesterContactId ?? '—'} mono />
            <InfoRow label="Account" value={ticket.accountId ?? '—'} mono />
          </InfoCard>

          <InfoCard title="Assignment">
            <InfoRow
              label="Assignee"
              value={
                ticket.assigneeId ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={userName(ticket.assigneeId)} size="sm" />
                    {userName(ticket.assigneeId)}
                  </span>
                ) : (
                  'Unassigned'
                )
              }
            />
            <InfoRow label="Team" value={ticket.teamId ?? '—'} mono />
          </InfoCard>

          <InfoCard title="SLA">
            <InfoRow label="First response due" value={formatDateTime(ticket.firstResponseDueAt)} />
            <InfoRow label="First responded" value={formatDateTime(ticket.firstRespondedAt)} />
            <InfoRow label="Resolution due" value={formatDateTime(ticket.resolutionDueAt)} />
            <InfoRow label="Resolved" value={formatDateTime(ticket.resolvedAt)} />
            <InfoRow
              label="Status"
              value={ticket.slaBreached ? <SlaBreachBadge breached /> : <span className="text-emerald-600">On track</span>}
            />
          </InfoCard>

          <InfoCard title="Details">
            <InfoRow label="Type" value={ticket.type ?? '—'} />
            <InfoRow label="Channel" value={ticket.channel} />
            <InfoRow label="Created" value={formatDateTime(ticket.createdAt)} />
            <InfoRow label="Updated" value={formatDateTime(ticket.updatedAt)} />
            {ticket.tags.length > 0 ? (
              <InfoRow
                label="Tags"
                value={
                  <span className="flex flex-wrap gap-1">
                    {ticket.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-slate-800"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                }
              />
            ) : null}
          </InfoCard>
        </aside>
      </div>
    </main>
  );
}

// ─── Comments tab ──────────────────────────────────────────────────────────────

function CommentsTab({
  ticketId,
  userName,
}: {
  ticketId: string;
  userName: (id?: string | null) => string;
}) {
  const commentsQuery = useTicketComments(ticketId);
  const addComment = useAddTicketComment();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const comments = commentsQuery.data ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    addComment.mutate(
      { id: ticketId, body: body.trim(), isInternal },
      { onSuccess: () => setBody('') }
    );
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-2">
        <textarea
          className={cn(
            'min-h-[80px] w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary',
            isInternal && 'border-amber-300 dark:border-amber-800'
          )}
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          placeholder={isInternal ? 'Internal note (not visible to the requester)…' : 'Reply to the requester…'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Lock className="h-3.5 w-3.5" /> Internal note
          </label>
          <Button type="submit" size="sm" isLoading={addComment.isPending} disabled={!body.trim()}>
            {isInternal ? 'Add note' : 'Send reply'}
          </Button>
        </div>
      </form>

      {commentsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          No comments yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                'rounded-lg border p-3',
                c.isInternal
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
                  : 'border-[var(--border-color)]'
              )}
            >
              <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="inline-flex items-center gap-2">
                  <Avatar name={userName(c.authorId)} size="sm" />
                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {userName(c.authorId)}
                  </span>
                  {c.isInternal ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <Lock className="h-3 w-3" /> Internal
                    </span>
                  ) : null}
                </span>
                <span>{formatDateTime(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── History tab ─────────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  created: 'Ticket created',
  updated: 'Ticket updated',
  status_changed: 'Status changed',
  assigned: 'Assignment changed',
  comment_added: 'Comment added',
  deleted: 'Ticket deleted',
  restored: 'Ticket restored',
  sla_breached: 'SLA breached',
};

function describe(e: TicketEvent): string {
  const d = e.data ?? {};
  if (e.type === 'status_changed' && d.from && d.to) {
    return `${String(d.from)} → ${String(d.to)}${d.reopen ? ' (reopen)' : ''}`;
  }
  if (e.type === 'comment_added') return d.isInternal ? 'Internal note' : 'Public reply';
  if (e.type === 'updated' && Array.isArray(d.fields)) return `Fields: ${(d.fields as string[]).join(', ')}`;
  if (e.type === 'created' && d.number) return String(d.number);
  return '';
}

function HistoryTab({
  ticketId,
  userName,
}: {
  ticketId: string;
  userName: (id?: string | null) => string;
}) {
  const historyQuery = useTicketHistory(ticketId);
  const events = historyQuery.data ?? [];

  if (historyQuery.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        No history yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 border-s ps-5" style={{ borderColor: 'var(--border-color)' }}>
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className="absolute -start-[23px] top-1 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: 'var(--primary, #6366f1)' }}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {EVENT_LABEL[e.type] ?? e.type}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatDateTime(e.createdAt)}
            </span>
          </div>
          {describe(e) ? (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {describe(e)}
            </p>
          ) : null}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {e.actorId ? `by ${userName(e.actorId)}` : 'system'}
          </p>
        </li>
      ))}
    </ol>
  );
}

// ─── Small presentational helpers ─────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
        active ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
    >
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className={cn('text-end', mono && 'font-mono text-xs')} style={{ color: 'var(--text-secondary)' }}>
        {value}
      </dd>
    </div>
  );
}
