'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Filter,
  GitBranch,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  approvalKeys,
  useApprovalRequests,
  useMyApprovals,
  type ApprovalRequest,
  type ApprovalStatus,
} from '@/hooks/use-approvals';
import { ApprovalDetailDrawer } from '@/components/approvals/ApprovalDetailDrawer';
import { PolicyAdmin } from '@/components/approvals/PolicyAdmin';
import { cn } from '@/lib/cn';

type Scope = 'MINE' | 'ALL' | ApprovalStatus;
type View = 'inbox' | 'policies';

type DiscountReason = { code: string; label: string };
type QuoteOption = { id: string; quoteNumber?: string; name: string; total?: string; currency?: string };

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'MINE', label: 'My Pending' },
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

// Dev-only fallback so the shell renders when approval-service 404s in mock mode.
const PREVIEW_APPROVALS: ApprovalRequest[] = [
  {
    id: 'approval-preview-001',
    tenantId: 'preview',
    policyId: 'policy-preview',
    module: 'Quote',
    recordId: 'QUO-2026-000148',
    requestedBy: 'Sara Manager',
    status: 'PENDING',
    currentStep: 1,
    data: { dealValue: 185000, requestedDiscountPercent: 18 },
    createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'approval-preview-002',
    tenantId: 'preview',
    policyId: 'policy-preview',
    module: 'Deal',
    recordId: 'OPP-2026-000093',
    requestedBy: 'Sales Rep',
    status: 'ESCALATED',
    currentStep: 2,
    data: { dealValue: 76000, requestedDiscountPercent: 22 },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function statusClass(status: ApprovalStatus): string {
  if (status === 'PENDING') return 'bg-amber-100 text-amber-800 ring-amber-200';
  if (status === 'ESCALATED') return 'bg-orange-100 text-orange-800 ring-orange-200';
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  if (status === 'CANCELLED') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-rose-100 text-rose-700 ring-rose-200';
}

function money(value: unknown): string {
  const amount = Number(value ?? 0);
  return amount ? `$${amount.toLocaleString()}` : '—';
}
function discount(value: unknown): string {
  const v = Number(value ?? 0);
  return v ? `${v.toLocaleString()}%` : '—';
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
function initials(value: string | undefined): string {
  return (value ?? 'Approval')
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.userId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const roles = useAuthStore((s) => s.roles);
  const isAdmin = roles.some((r) => r.toLowerCase() === 'admin') || hasPermission('settings:update');

  const [view, setView] = useState<View>('inbox');
  const [scope, setScope] = useState<Scope>('MINE');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const allQuery = useApprovalRequests({ limit: 100 });
  const mineQuery = useMyApprovals();

  const isDev = process.env.NODE_ENV === 'development';
  const allError = allQuery.isError && !allQuery.data;
  const usingPreview = allError && isDev;

  const allRows = useMemo(
    () => allQuery.data?.data ?? (usingPreview ? PREVIEW_APPROVALS : []),
    [allQuery.data?.data, usingPreview]
  );
  const mineRows = useMemo(
    () => mineQuery.data?.data ?? (mineQuery.isError && isDev ? PREVIEW_APPROVALS.slice(0, 1) : []),
    [mineQuery.data?.data, mineQuery.isError, isDev]
  );

  const scopedRows = useMemo(() => {
    if (scope === 'MINE') return mineRows;
    if (scope === 'ALL') return allRows;
    return allRows.filter((r) => r.status === scope);
  }, [scope, allRows, mineRows]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return scopedRows;
    return scopedRows.filter((r) =>
      [r.module, r.recordId, r.requestedBy, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [scopedRows, query]);

  const stats = useMemo(
    () => ({
      all: allRows.length,
      pending: allRows.filter((r) => r.status === 'PENDING').length,
      escalated: allRows.filter((r) => r.status === 'ESCALATED').length,
      approved: allRows.filter((r) => r.status === 'APPROVED').length,
    }),
    [allRows]
  );

  const refresh = () => qc.invalidateQueries({ queryKey: approvalKeys.all });
  const listLoading = scope === 'MINE' ? mineQuery.isLoading : allQuery.isLoading;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
                <ShieldCheck className="h-4 w-4" />
                Governance Queue
              </span>
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                Approval engine
              </span>
            </div>
            <div className="mt-5 max-w-3xl">
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Approval command center
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                Review multi-level approval requests across every module, act on your queue, and govern
                the routing policies behind them.
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <ViewTab active={view === 'inbox'} onClick={() => setView('inbox')} icon={FileCheck2} label="Inbox" />
              {isAdmin ? (
                <ViewTab
                  active={view === 'policies'}
                  onClick={() => setView('policies')}
                  icon={SlidersHorizontal}
                  label="Policies"
                />
              ) : null}
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 p-6 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard icon={Clock3} label="Pending" value={stats.pending} tone="amber" />
              <MetricCard icon={AlertCircle} label="Escalated" value={stats.escalated} tone="orange" />
              <MetricCard icon={CheckCircle2} label="Approved" value={stats.approved} tone="emerald" />
              <MetricCard icon={FileCheck2} label="In view" value={stats.all} tone="blue" />
            </div>
          </div>
        </div>
      </section>

      {view === 'policies' && isAdmin ? (
        <PolicyAdmin />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {SCOPES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setScope(item.value)}
                      className={cn(
                        'rounded-lg px-4 py-2 text-sm font-bold transition',
                        scope === item.value
                          ? 'bg-[#4f46e5] text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-[#4f46e5]'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative block min-w-0 sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                      placeholder="Search approvals..."
                      type="search"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={refresh}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Decision inbox</h2>
                  <p className="text-sm text-slate-500">
                    {listLoading ? 'Loading approvals...' : `${rows.length} records in view`}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Filter className="h-4 w-4" />
                  {scope}
                </span>
              </div>

              {usingPreview ? (
                <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
                  Approval service is offline — showing development preview records.
                </div>
              ) : null}

              {allError && !usingPreview && scope !== 'MINE' ? (
                <StatePanel
                  icon={AlertCircle}
                  title="Approval service is unavailable"
                  body="The queue could not be loaded. The page shell is stable; retry once the approval service is back online."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Request</th>
                        <th className="px-5 py-3">Commercial impact</th>
                        <th className="px-5 py-3">Requester</th>
                        <th className="px-5 py-3">Level</th>
                        <th className="px-5 py-3">Opened</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => {
                        const data = row.data ?? {};
                        return (
                          <tr key={row.id} className="transition hover:bg-slate-50/80">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-black text-[#4f46e5]">
                                  {initials(row.module)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-slate-950">{row.module}</p>
                                  <p className="mt-0.5 font-mono text-xs text-slate-500">{row.recordId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-bold text-slate-950">{money(data.dealValue)}</p>
                              <p className="text-xs text-slate-500">Discount {discount(data.requestedDiscountPercent)}</p>
                            </td>
                            <td className="px-5 py-4 font-medium text-slate-700">{row.requestedBy}</td>
                            <td className="px-5 py-4 text-slate-600">L{row.currentStep}</td>
                            <td className="px-5 py-4 text-slate-600">{formatDate(row.createdAt)}</td>
                            <td className="px-5 py-4">
                              <span className={cn('inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold ring-1', statusClass(row.status))}>
                                {row.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => setOpenId(row.id)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#4f46e5] transition hover:bg-indigo-50"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 ? (
                        <tr>
                          <td className="px-5 py-12" colSpan={7}>
                            <StatePanel
                              icon={listLoading ? TimerReset : FileCheck2}
                              title={listLoading ? 'Loading approval queue' : 'No approvals match this view'}
                              body={
                                listLoading
                                  ? 'Fetching request status, approvers, and commercial impact.'
                                  : 'Try another scope or search term.'
                              }
                            />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <DiscountRequestCard onCreated={refresh} />

            <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Awaiting my decision</h2>
                  <p className="text-sm text-slate-500">Requests routed to you right now.</p>
                </div>
                <GitBranch className="h-5 w-5 text-[#4f46e5]" />
              </div>
              <div className="mt-5 space-y-3">
                {mineQuery.isError && !isDev ? (
                  <StatePanel icon={AlertCircle} title="Could not load your queue" body="Retry when the approval service is reachable." compact />
                ) : null}
                {mineRows.map((row) => (
                  <button
                    key={`mine-${row.id}`}
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-950">{row.module}</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-500">{row.recordId}</p>
                      </div>
                      <span className={cn('shrink-0 rounded px-2 py-1 text-[10px] font-bold ring-1', statusClass(row.status))}>
                        {row.status}
                      </span>
                    </div>
                  </button>
                ))}
                {!mineQuery.isError && mineRows.length === 0 ? (
                  <StatePanel
                    icon={CheckCircle2}
                    title={mineQuery.isLoading ? 'Loading your approvals' : 'Nothing waiting on you'}
                    body={mineQuery.isLoading ? 'Checking requests routed to you.' : 'Your approval queue is clear.'}
                    compact
                  />
                ) : null}
              </div>
            </section>

            <section className="rounded-xl bg-slate-950 p-5 text-white shadow-sm">
              <h2 className="text-lg font-bold">Approval controls</h2>
              <div className="mt-4 space-y-4 text-sm text-slate-300">
                <ControlLine label="Routing engine" value="Policy + hierarchy" />
                <ControlLine label="Quorum" value="ALL / ANY / N-of-M" />
                <ControlLine label="Audit trail" value="Immutable events" />
                <ControlLine label="Delegation" value="Per-step delegable" />
              </div>
            </section>
          </aside>
        </section>
      )}

      {openId ? (
        <ApprovalDetailDrawer
          requestId={openId}
          onClose={() => setOpenId(null)}
          currentUserId={userId}
          isAdmin={isAdmin}
        />
      ) : null}
    </div>
  );
}

// ─── Discount request (finance) — the pre-existing DRQ origination path ─────────

function DiscountRequestCard({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    quoteId: 'quote-nova-cpq-v1',
    requestedDiscountPercent: '12',
    reasonCode: 'STRATEGIC_ACCOUNT',
    winningProbabilityIfApproved: '72',
    reasonNotes: '',
    level1: 'Finance Manager',
    level2: 'Sales Director',
    level3: '',
  });

  const [quoteOptions, setQuoteOptions] = useState<QuoteOption[]>([]);
  const [reasons, setReasons] = useState<DiscountReason[]>([]);

  // Best-effort option loads; failures degrade to free-text defaults.
  useEffect(() => {
    void fetch('/api/quotes?limit=50', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data?.data ?? j.data ?? []) as QuoteOption[];
        setQuoteOptions(list);
        if (list.length > 0) {
          setForm((s) => (list.some((q) => q.id === s.quoteId) ? s : { ...s, quoteId: list[0].id }));
        }
      })
      .catch(() => setQuoteOptions([]));
    void fetch('/api/finance/discount-requests/reasons', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []) as DiscountReason[];
        setReasons(list);
        if (list.length > 0) {
          setForm((s) => (list.some((r) => r.code === s.reasonCode) ? s : { ...s, reasonCode: list[0].code }));
        }
      })
      .catch(() => setReasons([]));
  }, []);

  const createDrq = useMutation({
    mutationFn: async () => {
      const hierarchy = [form.level1, form.level2, form.level3]
        .map((approver, index) => ({ level: index + 1, approver: approver.trim() }))
        .filter((item) => item.approver);
      const res = await fetch('/api/finance/discount-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: form.quoteId,
          requestedDiscountPercent: Number(form.requestedDiscountPercent),
          reasonCode: form.reasonCode,
          reasonNotes: form.reasonNotes,
          businessImpact: form.reasonNotes,
          winningProbabilityIfApproved: Number(form.winningProbabilityIfApproved),
          approverHierarchy: hierarchy,
          customFields: { approverHierarchy: hierarchy, workflow: 'DRQ_STANDARD_HIERARCHY' },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const details = json.details ? ` ${Object.values(json.details).join(' ')}` : '';
        throw new Error(`${json.error?.message ?? 'DRQ validation failed'}${details}`);
      }
      return json.data;
    },
    onSuccess: () => {
      onCreated();
      setForm((s) => ({ ...s, reasonNotes: '' }));
    },
  });

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Create DRQ</h2>
          <p className="text-sm text-slate-500">Validated discount request with approval hierarchy.</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-[#4f46e5]" />
      </div>
      <div className="mt-4 space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
          Quote
          <select
            value={form.quoteId}
            onChange={(e) => setForm((s) => ({ ...s, quoteId: e.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            {quoteOptions.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.quoteNumber ?? quote.id} · {quote.name}
              </option>
            ))}
            {quoteOptions.length === 0 ? (
              <option value="quote-nova-cpq-v1">Q-2026-000003 · Nova Retail</option>
            ) : null}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Discount %
            <input
              value={form.requestedDiscountPercent}
              min="0.01"
              max="80"
              type="number"
              onChange={(e) => setForm((s) => ({ ...s, requestedDiscountPercent: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm normal-case"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Win %
            <input
              value={form.winningProbabilityIfApproved}
              min="1"
              max="100"
              type="number"
              onChange={(e) => setForm((s) => ({ ...s, winningProbabilityIfApproved: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm normal-case"
            />
          </label>
        </div>
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
          Prevalidated reason
          <select
            value={form.reasonCode}
            onChange={(e) => setForm((s) => ({ ...s, reasonCode: e.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case text-slate-700"
          >
            {reasons.length > 0 ? (
              reasons.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.label}
                </option>
              ))
            ) : (
              <option value="STRATEGIC_ACCOUNT">Strategic account</option>
            )}
          </select>
        </label>
        <textarea
          value={form.reasonNotes}
          onChange={(e) => setForm((s) => ({ ...s, reasonNotes: e.target.value }))}
          rows={3}
          placeholder="Business reason, customer context, competitive pressure..."
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <div className="grid gap-2">
          {[1, 2, 3].map((level) => (
            <input
              key={level}
              value={form[`level${level}` as 'level1']}
              onChange={(e) => setForm((s) => ({ ...s, [`level${level}`]: e.target.value }))}
              placeholder={`Approval level ${level}${level === 3 ? ' (optional)' : ''}`}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
            />
          ))}
        </div>
        {createDrq.isError ? (
          <p className="rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{createDrq.error.message}</p>
        ) : null}
        {createDrq.isSuccess ? (
          <p className="rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">
            DRQ created and routed to the approval workflow.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => createDrq.mutate()}
          disabled={createDrq.isPending}
          className="w-full rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {createDrq.isPending ? 'Validating...' : 'Create DRQ workflow'}
        </button>
      </div>
    </section>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition',
        active
          ? 'bg-slate-950 text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: 'amber' | 'orange' | 'emerald' | 'blue';
}) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600',
    orange: 'bg-orange-50 text-orange-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-indigo-50 text-[#4f46e5]',
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={cn('mb-3 inline-flex rounded-lg p-2', tones[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function StatePanel({
  icon: Icon,
  title,
  body,
  compact = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-5' : 'py-10')}>
      <div className="rounded-lg bg-slate-100 p-3 text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-bold text-slate-900">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{body}</p>
    </div>
  );
}

function ControlLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span>{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}
