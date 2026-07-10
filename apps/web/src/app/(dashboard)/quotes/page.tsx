'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/hooks/use-confirm';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SavedViewsControl } from '@/components/crm/SavedViewsControl';
import { ExportButton } from '@/components/export/ExportButton';
import {
  useApproveQuote,
  useArchivedQuotes,
  useDuplicateQuote,
  useQuotes,
  useRestoreQuote,
  useSendQuote,
  useVoidQuote,
  type Quote,
} from '@/hooks/use-quotes';
import { useAccounts } from '@/hooks/use-accounts';
import { useContacts } from '@/hooks/use-contacts';
import { useUsers } from '@/hooks/use-users';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';

export default function QuotesPage(): JSX.Element {
  const { prompt, PromptDialog } = usePrompt();
  const [status, setStatus] = useState<Quote['status'] | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [isHydrated, setIsHydrated] = useState(false);
  const roles = useAuthStore((s) => s.roles);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = roles.some((role) => role.toLowerCase() === 'admin');
  const canUseStandaloneQuoteBuilder = isAdmin || hasPermission('quotes:admin') || hasPermission('admin:*');
  const canApprove = isAdmin || hasPermission('quotes:approve');

  const activeQuery = useQuotes({
    status: status || undefined,
    ownerId: ownerId.trim() || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
    page,
    limit: 25,
  });
  const archivedQuery = useArchivedQuotes(
    { ownerId: ownerId.trim() || undefined, page, limit: 25 },
    { enabled: view === 'archived' }
  );
  const query = view === 'archived' ? archivedQuery : activeQuery;

  const sendQuote = useSendQuote();
  const duplicateQuote = useDuplicateQuote();
  const voidQuote = useVoidQuote();
  const approveQuote = useApproveQuote();
  const restoreQuote = useRestoreQuote();

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  // Resolve linked account / contact / owner names so the table reads clearly
  // instead of showing truncated ids (finance quotes only carry ids).
  const accountsQuery = useAccounts({ limit: 100 });
  const contactsQuery = useContacts({ limit: 100 });
  const usersQuery = useUsers({ limit: 100 });
  const accountName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accountsQuery.data?.data ?? []) m.set(a.id, a.name);
    return m;
  }, [accountsQuery.data]);
  const contactName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contactsQuery.data?.data ?? []) m.set(c.id, `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim());
    return m;
  }, [contactsQuery.data]);
  const ownerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usersQuery.data?.data ?? []) {
      const r = u as { id: string; name?: string; firstName?: string; lastName?: string; email?: string };
      m.set(r.id, r.name || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email || r.id);
    }
    return m;
  }, [usersQuery.data]);
  const short = (id: string) => `${id.slice(0, 8)}…`;

  const statusOptions = useMemo(
    () => ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'VOID'] as const,
    []
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return (
      <main className="space-y-4 px-6 py-6">
        <TableSkeleton rows={8} cols={10} />
      </main>
    );
  }

  return (
    <main className="space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
          <p className="text-sm text-slate-600">Finance quote lifecycle and actions.</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          <button
            type="button"
            onClick={() => { setView('active'); setPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium ${view === 'active' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => { setView('archived'); setPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium ${view === 'archived' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Archived
          </button>
        </div>
        <ExportButton module="quotes" filters={{ status, ownerId }} />
        <SavedViewsControl
          entityType="quote"
          currentFilters={{ status, ownerId, dateFrom, dateTo }}
          onApply={(f) => {
            setStatus(typeof f.status === 'string' ? (f.status as Quote['status'] | '') : '');
            setOwnerId(typeof f.ownerId === 'string' ? f.ownerId : '');
            setDateFrom(typeof f.dateFrom === 'string' ? f.dateFrom : '');
            setDateTo(typeof f.dateTo === 'string' ? f.dateTo : '');
            setPage(1);
          }}
        />
        {canUseStandaloneQuoteBuilder ? (
          <Link href="/quotes/new">
            <Button type="button">Admin quote builder</Button>
          </Link>
        ) : (
          <Link href="/rfqs">
            <Button type="button">Start from RFQ</Button>
          </Link>
        )}
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Quote['status'] | '');
                setPage(1);
              }}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm normal-case text-slate-700"
            >
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Owner ID</span>
            <Input value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="cuid..." />
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Date from</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Date to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {query.isLoading ? (
          <TableSkeleton rows={8} cols={10} />
        ) : query.isError ? (
          <div className="p-4 text-sm text-red-600">Failed to load quotes.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-start">Quote #</th>
                <th className="px-3 py-2 text-start">Account</th>
                <th className="px-3 py-2 text-start">Contact</th>
                <th className="px-3 py-2 text-start">Status</th>
                <th className="px-3 py-2 text-end">Total</th>
                <th className="px-3 py-2 text-start">Approval</th>
                <th className="px-3 py-2 text-start">Valid Until</th>
                <th className="px-3 py-2 text-start">Owner</th>
                <th className="px-3 py-2 text-start">Created</th>
                <th className="px-3 py-2 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/quotes/${q.id}`} className="text-brand-700 hover:underline">
                      {q.quoteNumber || q.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {q.accountId ? (
                      <Link href={`/accounts/${q.accountId}`} className="text-brand-700 hover:underline">
                        {accountName.get(q.accountId) ?? short(q.accountId)}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {(q as { contactId?: string }).contactId ? (
                      <Link href={`/contacts/${(q as { contactId?: string }).contactId}`} className="text-brand-700 hover:underline">
                        {contactName.get((q as { contactId: string }).contactId) ?? short((q as { contactId: string }).contactId)}
                      </Link>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={q.status} />
                  </td>
                  <td className="px-3 py-2 text-end">{formatCurrency(q.total, q.currency)}</td>
                  <td className="px-3 py-2"><ApprovalCell quote={q} /></td>
                  <td className="px-3 py-2">{formatDate(q.expiresAt ?? q.validUntil)}</td>
                  <td className="px-3 py-2">{ownerName.get(q.ownerId) ?? short(q.ownerId)}</td>
                  <td className="px-3 py-2">{formatDate(q.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {view === 'archived' ? (
                        <Button type="button" variant="secondary" onClick={() => restoreQuote.mutate(q.id)} isLoading={restoreQuote.isPending}>
                          Restore
                        </Button>
                      ) : (
                        <>
                          {q.status === 'PENDING_APPROVAL' && canApprove ? (
                            <Button type="button" onClick={() => approveQuote.mutate(q.id)} isLoading={approveQuote.isPending}>
                              Approve
                            </Button>
                          ) : null}
                          {q.status === 'DRAFT' || q.status === 'APPROVED' ? (
                            <Button type="button" variant="secondary" onClick={() => sendQuote.mutate(q.id)}>
                              Send
                            </Button>
                          ) : null}
                          <Button type="button" variant="secondary" onClick={() => duplicateQuote.mutate(q.id)}>
                            Duplicate
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={async () => {
                              const reason = await prompt('Void reason', 'Void Quote');
                              if (reason) voidQuote.mutate({ id: q.id, reason });
                            }}
                          >
                            Void
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-sm text-slate-500">
                    No quotes found for current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>

      {PromptDialog}
      <footer className="flex items-center justify-between text-sm">
        <p className="text-slate-500">
          {rows.length} shown / {total} total
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-slate-600">
            Page {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </footer>
    </main>
  );
}

function ApprovalCell({ quote }: { quote: Quote }) {
  const q = quote as { requiredApprovalLevel?: number; approvalLevel?: number; approvalRequired?: boolean };
  const req = q.requiredApprovalLevel ?? 0;
  const cur = q.approvalLevel ?? 0;
  if (!req && !q.approvalRequired) return <span className="text-xs text-slate-400">—</span>;
  if (req && cur >= req) {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Approved</span>;
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      {req ? `L${cur}/${req} pending` : 'Pending'}
    </span>
  );
}

function StatusPill({ status }: { status: Quote['status'] }) {
  const cls: Record<Quote['status'], string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    SENT: 'bg-indigo-100 text-indigo-800',
    ACCEPTED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-amber-100 text-amber-800',
    VOID: 'bg-slate-200 text-slate-700',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    VIEWED: 'bg-sky-100 text-sky-800',
    CONVERTED: 'bg-indigo-100 text-indigo-800',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls[status]}`}>
      {status}
    </span>
  );
}
