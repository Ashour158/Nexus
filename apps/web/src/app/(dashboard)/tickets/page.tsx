'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/avatar';
import { CreateTicketModal } from '@/components/tickets/create-ticket-modal';
import { TicketStatusPill, TicketPriorityPill, SlaBreachBadge } from '@/components/tickets/ticket-pills';
import { useUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth.store';
import { formatDateTime } from '@/lib/format';
import {
  useTickets,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  type Ticket,
} from '@/hooks/use-tickets';

const PAGE_SIZE = 25;

export default function TicketsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isDevPreview = process.env.NODE_ENV === 'development';
  const canManageSla = isDevPreview || hasPermission('tickets:update') || hasPermission('tickets:*');

  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const usersQuery = useUsers({ limit: 200 });
  const users = usersQuery.data?.data ?? [];
  const userName = (id?: string | null) => {
    if (!id) return '—';
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : id;
  };

  const ticketsQuery = useTickets({
    status: (status || undefined) as Ticket['status'] | undefined,
    priority: (priority || undefined) as Ticket['priority'] | undefined,
    assigneeId: assigneeId || undefined,
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const rows = ticketsQuery.data ?? [];
  const hasMore = rows.length === PAGE_SIZE;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Tickets
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Track support cases, SLAs, and customer conversations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canManageSla ? (
            <Link href="/tickets/sla-policies">
              <Button type="button" variant="outline">
                <Settings className="h-4 w-4" /> SLA policies
              </Button>
            </Link>
          ) : null}
          <Button type="button" onClick={() => setCreateOpen(true)}>
            New ticket
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        <FilterBar
          searchPlaceholder="Search by subject, number, description…"
          searchValue={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          onRefresh={() => ticketsQuery.refetch()}
          filters={[
            {
              label: 'Status',
              value: status,
              options: [
                { label: 'All Statuses', value: '' },
                ...TICKET_STATUSES.map((s) => ({ label: s.replace('_', ' '), value: s })),
              ],
              onChange: (v) => {
                setStatus(v);
                setPage(1);
              },
            },
            {
              label: 'Priority',
              value: priority,
              options: [
                { label: 'All Priorities', value: '' },
                ...TICKET_PRIORITIES.map((p) => ({ label: p, value: p })),
              ],
              onChange: (v) => {
                setPriority(v);
                setPage(1);
              },
            },
            {
              label: 'Assignee',
              value: assigneeId,
              options: [
                { label: 'All Assignees', value: '' },
                ...users.map((u) => ({ label: `${u.firstName} ${u.lastName}`, value: u.id })),
              ],
              onChange: (v) => {
                setAssigneeId(v);
                setPage(1);
              },
            },
          ]}
        />

        {ticketsQuery.isError ? (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            Failed to load tickets. Try refreshing.
          </div>
        ) : null}

        <DataTable
          data={rows}
          keyExtractor={(row) => row.id}
          loading={ticketsQuery.isLoading}
          columns={[
            {
              key: 'number',
              header: 'Ticket',
              cell: (row) => (
                <Link
                  href={`/tickets/${row.id}`}
                  className="font-medium hover:text-primary hover:underline"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {row.number}
                </Link>
              ),
            },
            {
              key: 'subject',
              header: 'Subject',
              cell: (row) => (
                <div className="flex items-center gap-2">
                  <Link
                    href={`/tickets/${row.id}`}
                    className="line-clamp-1 max-w-md hover:underline"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {row.subject}
                  </Link>
                  <SlaBreachBadge breached={row.slaBreached} />
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              align: 'center',
              cell: (row) => <TicketStatusPill status={row.status} />,
            },
            {
              key: 'priority',
              header: 'Priority',
              align: 'center',
              cell: (row) => <TicketPriorityPill priority={row.priority} />,
            },
            {
              key: 'assignee',
              header: 'Assignee',
              cell: (row) =>
                row.assigneeId ? (
                  <div className="flex items-center gap-2">
                    <Avatar name={userName(row.assigneeId)} size="sm" />
                    <span style={{ color: 'var(--text-secondary)' }}>{userName(row.assigneeId)}</span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                ),
            },
            {
              key: 'requester',
              header: 'Requester',
              cell: (row) => (
                <span style={{ color: 'var(--text-muted)' }}>{row.requesterEmail ?? '—'}</span>
              ),
            },
            {
              key: 'updatedAt',
              header: 'Updated',
              cell: (row) => (
                <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(row.updatedAt)}</span>
              ),
            },
          ]}
          emptyState={
            <EmptyState
              icon="🎫"
              title="No tickets found"
              description="Adjust your filters or create a new ticket to get started."
              cta={{ label: 'New ticket', onClick: () => setCreateOpen(true) }}
            />
          }
        />

        {/* Length-based pagination — the list envelope's total is not surfaced
            by the shared typed client, so we page on "a full page ⇒ maybe more". */}
        {(page > 1 || hasMore) && rows.length > 0 ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Page {page}
            </span>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      <CreateTicketModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </main>
  );
}
