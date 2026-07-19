'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, FileSignature, FileText, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/hooks/use-confirm';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  CRMEmptyState,
  CRMErrorState,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMSegmentedControl,
  CRMStatusBadge,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';
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

  // Page-local status counts for the header metrics. Cheap enough (<=25 rows)
  // that memoizing would only add a dependency on a freshly-built array.
  const rowStats = {
    pendingApproval: rows.filter((q) => q.status === 'PENDING_APPROVAL').length,
    accepted: rows.filter((q) => q.status === 'ACCEPTED').length,
    draft: rows.filter((q) => q.status === 'DRAFT').length,
  };

  const statusOptions = useMemo(
    () => ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'VOID'] as const,
    []
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return (
      <CRMModuleShell className="space-y-6">
        <CRMTableShell>
          <TableSkeleton rows={8} cols={10} />
        </CRMTableShell>
      </CRMModuleShell>
    );
  }

  return (
    <CRMModuleShell className="space-y-6">
      <CRMPageHeader
        eyebrow="Commercial"
        icon={FileSignature}
        title="Quotes"
        description="The finance quote lifecycle — approve, send, duplicate, and void priced offers."
        badges={
          view === 'archived' ? (
            <span className="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface-variant">
              Viewing archived quotes
            </span>
          ) : null
        }
        actions={
          <>
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
          </>
        }
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard icon={FileText} label="Total quotes" value={total} note="matching filters" />
            <CRMMetricCard icon={Hourglass} label="Pending approval" value={rowStats.pendingApproval} note="on this page" tone="amber" />
            <CRMMetricCard icon={CheckCircle2} label="Accepted" value={rowStats.accepted} note="on this page" tone="emerald" />
            <CRMMetricCard icon={Archive} label="Drafts" value={rowStats.draft} note="on this page" tone="slate" />
          </CRMMetricGrid>
        }
      />

      <CRMToolbar>
        <CRMSegmentedControl
          value={view}
          onChange={(next) => {
            setView(next);
            setPage(1);
          }}
          options={[
            { value: 'active' as const, label: 'Active', icon: FileText },
            { value: 'archived' as const, label: 'Archived', icon: Archive },
          ]}
        />

        <div className="grid w-full gap-3 md:grid-cols-4 xl:max-w-3xl">
          <label className="space-y-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Quote['status'] | '');
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm normal-case text-on-surface outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span>Owner ID</span>
            <Input value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="cuid..." />
          </label>

          <label className="space-y-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span>Date from</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>

          <label className="space-y-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span>Date to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </CRMToolbar>

      <CRMTableShell>
        {query.isLoading ? (
          <TableSkeleton rows={8} cols={10} />
        ) : query.isError ? (
          <div className="p-5">
            <CRMErrorState
              title="Unable to load quotes"
              description="The finance service did not respond. Try again in a moment."
            />
          </div>
        ) : rows.length === 0 ? (
          <CRMEmptyState
            icon={FileSignature}
            title="No quotes found"
            description="No quotes match the current filters. Adjust the status, owner, or date range."
          />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
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
                <tr key={q.id} className="border-t border-outline-variant">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/quotes/${q.id}`} className="font-semibold text-primary hover:underline">
                      {q.quoteNumber || q.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {q.accountId ? (
                      <Link href={`/accounts/${q.accountId}`} className="font-semibold text-primary hover:underline">
                        {accountName.get(q.accountId) ?? short(q.accountId)}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {(q as { contactId?: string }).contactId ? (
                      <Link href={`/contacts/${(q as { contactId?: string }).contactId}`} className="font-semibold text-primary hover:underline">
                        {contactName.get((q as { contactId: string }).contactId) ?? short((q as { contactId: string }).contactId)}
                      </Link>
                    ) : <span className="text-on-surface-variant">—</span>}
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
            </tbody>
          </table>
        )}
      </CRMTableShell>

      {PromptDialog}
      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm shadow-card">
        <p className="text-on-surface-variant">
          {rows.length} shown / {total} total
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-on-surface-variant">
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
    </CRMModuleShell>
  );
}

function ApprovalCell({ quote }: { quote: Quote }) {
  const q = quote as { requiredApprovalLevel?: number; approvalLevel?: number; approvalRequired?: boolean };
  const req = q.requiredApprovalLevel ?? 0;
  const cur = q.approvalLevel ?? 0;
  if (!req && !q.approvalRequired) return <span className="text-xs text-on-surface-variant">—</span>;
  if (req && cur >= req) {
    return <CRMStatusBadge tone="emerald">Approved</CRMStatusBadge>;
  }
  return <CRMStatusBadge tone="amber">{req ? `L${cur}/${req} pending` : 'Pending'}</CRMStatusBadge>;
}

const QUOTE_STATUS_TONES: Record<Quote['status'], 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate'> = {
  DRAFT: 'slate',
  SENT: 'blue',
  ACCEPTED: 'emerald',
  REJECTED: 'rose',
  EXPIRED: 'amber',
  VOID: 'slate',
  PENDING_APPROVAL: 'amber',
  APPROVED: 'emerald',
  VIEWED: 'orange',
  CONVERTED: 'blue',
};

function StatusPill({ status }: { status: Quote['status'] }) {
  return <CRMStatusBadge tone={QUOTE_STATUS_TONES[status] ?? 'slate'}>{status}</CRMStatusBadge>;
}
