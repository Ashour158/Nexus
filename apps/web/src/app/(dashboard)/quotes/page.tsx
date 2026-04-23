'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDuplicateQuote,
  useQuotes,
  useSendQuote,
  useVoidQuote,
  type Quote,
} from '@/hooks/use-quotes';
import { formatCurrency, formatDate } from '@/lib/format';

export default function QuotesPage(): JSX.Element {
  const [status, setStatus] = useState<Quote['status'] | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuotes({
    status: status || undefined,
    ownerId: ownerId.trim() || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
    page,
    limit: 25,
  });

  const sendQuote = useSendQuote();
  const duplicateQuote = useDuplicateQuote();
  const voidQuote = useVoidQuote();

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  const statusOptions = useMemo(
    () => ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'VOID'] as const,
    []
  );

  return (
    <main className="space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
          <p className="text-sm text-slate-600">Finance quote lifecycle and actions.</p>
        </div>
        <Link href="/quotes/new">
          <Button type="button">New Quote</Button>
        </Link>
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
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4 text-sm text-red-600">Failed to load quotes.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Quote #</th>
                <th className="px-3 py-2 text-left">Deal</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-center">Version</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{q.quoteNumber || q.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/deals/${q.dealId}`} className="text-brand-700 hover:underline">
                      {q.dealId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2">{q.accountId.slice(0, 8)}…</td>
                  <td className="px-3 py-2">
                    <StatusPill status={q.status} />
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(q.total, q.currency)}</td>
                  <td className="px-3 py-2 text-center">{q.version}</td>
                  <td className="px-3 py-2">{formatDate(q.expiresAt ?? q.validUntil)}</td>
                  <td className="px-3 py-2">{q.ownerId.slice(0, 8)}…</td>
                  <td className="px-3 py-2">{formatDate(q.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {q.status === 'DRAFT' ? (
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
                        onClick={() => {
                          const reason = window.prompt('Void reason');
                          if (reason) voidQuote.mutate({ id: q.id, reason });
                        }}
                      >
                        Void
                      </Button>
                      <Button type="button" variant="ghost">
                        PDF
                      </Button>
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

function StatusPill({ status }: { status: Quote['status'] }) {
  const cls: Record<Quote['status'], string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    SENT: 'bg-blue-100 text-blue-800',
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
