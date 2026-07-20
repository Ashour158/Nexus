'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Filter,
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
import {
  CRMCard,
  CRMEmptyState,
  CRMErrorState,
  CRMFilterPills,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMSegmentedControl,
  CRMSidePanel,
  CRMStatusBadge,
  CRMToolbar,
} from '@/components/ui/crm';

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

type BadgeTone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

function statusTone(status: ApprovalStatus): BadgeTone {
  if (status === 'PENDING') return 'amber';
  if (status === 'ESCALATED') return 'amber';
  if (status === 'APPROVED') return 'emerald';
  if (status === 'CANCELLED') return 'slate';
  return 'rose';
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
    <CRMModuleShell>
      <CRMPageHeader
        eyebrow="Governance Queue"
        icon={ShieldCheck}
        title="Approval command center"
        description="Review multi-level approval requests across every module, act on your queue, and govern the routing policies behind them."
        badges={
          <span className="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface-variant">
            Approval engine
          </span>
        }
        actions={
          <CRMSegmentedControl
            value={view}
            onChange={setView}
            options={
              isAdmin
                ? [
                    { value: 'inbox' as View, label: 'Inbox', icon: FileCheck2 },
                    { value: 'policies' as View, label: 'Policies', icon: SlidersHorizontal },
                  ]
                : [{ value: 'inbox' as View, label: 'Inbox', icon: FileCheck2 }]
            }
          />
        }
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard icon={Clock3} label="Pending" value={stats.pending} tone="amber" />
            <CRMMetricCard icon={AlertCircle} label="Escalated" value={stats.escalated} tone="orange" />
            <CRMMetricCard icon={CheckCircle2} label="Approved" value={stats.approved} tone="emerald" />
            <CRMMetricCard icon={FileCheck2} label="In view" value={stats.all} tone="blue" />
          </CRMMetricGrid>
        }
      />

      {view === 'policies' && isAdmin ? (
        <PolicyAdmin />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <CRMToolbar>
              <CRMFilterPills value={scope} options={SCOPES} onChange={setScope} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block min-w-0 sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low pl-10 pr-3 text-sm text-on-surface outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/30"
                    placeholder="Search approvals..."
                    type="search"
                  />
                </label>
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 text-sm font-bold text-on-surface-variant transition hover:bg-surface-container-low"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </CRMToolbar>

            <CRMCard
              padded={false}
              title="Decision inbox"
              description={listLoading ? 'Loading approvals...' : `${rows.length} records in view`}
              actions={
                <span className="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  <Filter className="h-4 w-4" />
                  {scope}
                </span>
              }
              className="overflow-hidden"
            >
              {usingPreview ? (
                <div className="border-b border-warning/30 bg-warning-container px-5 py-3 text-sm font-medium text-on-warning-container">
                  Approval service is offline — showing development preview records.
                </div>
              ) : null}

              {allError && !usingPreview && scope !== 'MINE' ? (
                <div className="p-5">
                  <CRMErrorState
                    title="Approval service is unavailable"
                    description="The queue could not be loaded. The page shell is stable; retry once the approval service is back online."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-surface-container-low text-xs font-bold uppercase tracking-wider text-on-surface-variant">
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
                    <tbody className="divide-y divide-outline-variant">
                      {rows.map((row) => {
                        const data = row.data ?? {};
                        return (
                          <tr key={row.id} className="transition hover:bg-surface-container-low/80">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container text-xs font-black text-on-primary-container">
                                  {initials(row.module)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-on-surface">{row.module}</p>
                                  <p className="mt-0.5 font-mono text-xs text-on-surface-variant">{row.recordId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-bold text-on-surface">{money(data.dealValue)}</p>
                              <p className="text-xs text-on-surface-variant">Discount {discount(data.requestedDiscountPercent)}</p>
                            </td>
                            <td className="px-5 py-4 font-medium text-on-surface">{row.requestedBy}</td>
                            <td className="px-5 py-4 text-on-surface-variant">L{row.currentStep}</td>
                            <td className="px-5 py-4 text-on-surface-variant">{formatDate(row.createdAt)}</td>
                            <td className="px-5 py-4">
                              <CRMStatusBadge tone={statusTone(row.status)}>{row.status}</CRMStatusBadge>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => setOpenId(row.id)}
                                className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary-container"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <CRMEmptyState
                              icon={listLoading ? TimerReset : FileCheck2}
                              title={listLoading ? 'Loading approval queue' : 'No approvals match this view'}
                              description={
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
            </CRMCard>
          </div>

          <aside className="space-y-6">
            <DiscountRequestCard onCreated={refresh} />

            <CRMSidePanel title="Awaiting my decision" description="Requests routed to you right now.">
              <div className="space-y-3">
                {mineQuery.isError && !isDev ? (
                  <CRMErrorState title="Could not load your queue" description="Retry when the approval service is reachable." />
                ) : null}
                {mineRows.map((row) => (
                  <button
                    key={`mine-${row.id}`}
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="block w-full rounded-lg border border-outline-variant bg-surface-container-low p-4 text-left transition hover:border-primary/40 hover:bg-primary-container"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-on-surface">{row.module}</p>
                        <p className="mt-1 truncate font-mono text-xs text-on-surface-variant">{row.recordId}</p>
                      </div>
                      <CRMStatusBadge tone={statusTone(row.status)} className="shrink-0 text-[10px]">
                        {row.status}
                      </CRMStatusBadge>
                    </div>
                  </button>
                ))}
                {!mineQuery.isError && mineRows.length === 0 ? (
                  <CRMEmptyState
                    icon={CheckCircle2}
                    title={mineQuery.isLoading ? 'Loading your approvals' : 'Nothing waiting on you'}
                    description={mineQuery.isLoading ? 'Checking requests routed to you.' : 'Your approval queue is clear.'}
                    className="p-5"
                  />
                ) : null}
              </div>
            </CRMSidePanel>

            <section className="rounded-xl bg-inverse-surface p-5 text-inverse-on-surface shadow-card">
              <h2 className="text-lg font-bold">Approval controls</h2>
              <div className="mt-4 space-y-4 text-sm text-inverse-on-surface/70">
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
    </CRMModuleShell>
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
    <CRMSidePanel title="Create DRQ" description="Validated discount request with approval hierarchy.">
      <div className="space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          Quote
          <select
            value={form.quoteId}
            onChange={(e) => setForm((s) => ({ ...s, quoteId: e.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
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
          <label className="block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
            Discount %
            <input
              value={form.requestedDiscountPercent}
              min="0.01"
              max="80"
              type="number"
              onChange={(e) => setForm((s) => ({ ...s, requestedDiscountPercent: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm normal-case"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
            Win %
            <input
              value={form.winningProbabilityIfApproved}
              min="1"
              max="100"
              type="number"
              onChange={(e) => setForm((s) => ({ ...s, winningProbabilityIfApproved: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm normal-case"
            />
          </label>
        </div>
        <label className="block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          Prevalidated reason
          <select
            value={form.reasonCode}
            onChange={(e) => setForm((s) => ({ ...s, reasonCode: e.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium normal-case text-on-surface"
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
          className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <div className="grid gap-2">
          {[1, 2, 3].map((level) => (
            <input
              key={level}
              value={form[`level${level}` as 'level1']}
              onChange={(e) => setForm((s) => ({ ...s, [`level${level}`]: e.target.value }))}
              placeholder={`Approval level ${level}${level === 3 ? ' (optional)' : ''}`}
              className="h-9 rounded-lg border border-outline-variant px-3 text-sm"
            />
          ))}
        </div>
        {createDrq.isError ? (
          <p className="rounded-lg bg-error-container p-2 text-xs font-semibold text-on-error-container">{createDrq.error.message}</p>
        ) : null}
        {createDrq.isSuccess ? (
          <p className="rounded-lg bg-success-container p-2 text-xs font-semibold text-on-success-container">
            DRQ created and routed to the approval workflow.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => createDrq.mutate()}
          disabled={createDrq.isPending}
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary transition hover:bg-primary/90 disabled:opacity-60"
        >
          {createDrq.isPending ? 'Validating...' : 'Create DRQ workflow'}
        </button>
      </div>
    </CRMSidePanel>
  );
}

function ControlLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-inverse-on-surface/10 pb-3 last:border-0 last:pb-0">
      <span>{label}</span>
      <span className="font-bold text-inverse-on-surface">{value}</span>
    </div>
  );
}
