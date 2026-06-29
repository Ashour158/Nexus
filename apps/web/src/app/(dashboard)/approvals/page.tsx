'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  TimerReset,
  XCircle,
} from 'lucide-react';
import { apiClients } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'CANCELLED';

type ApprovalRequest = {
  id: string;
  module: string;
  recordId: string;
  data?: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
  requestedBy?: string;
  currentApproverId?: string;
};

type ApprovalListResult = { data: ApprovalRequest[]; total: number; page: number; limit: number };
type DiscountReason = { code: string; label: string };
type QuoteOption = { id: string; quoteNumber?: string; name: string; total?: string; currency?: string };

const FILTERS: Array<{ value: 'ALL' | ApprovalStatus; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

const PREVIEW_APPROVALS: ApprovalRequest[] = [
  {
    id: 'approval-preview-001',
    module: 'Quote',
    recordId: 'QUO-2026-000148',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    requestedBy: 'Sara Manager',
    currentApproverId: 'Finance Director',
    data: { dealValue: 185000, requestedDiscountPercent: 18 },
  },
  {
    id: 'approval-preview-002',
    module: 'Deal',
    recordId: 'OPP-2026-000093',
    status: 'ESCALATED',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    requestedBy: 'Sales Rep',
    currentApproverId: 'Regional VP',
    data: { dealValue: 76000, requestedDiscountPercent: 22 },
  },
  {
    id: 'approval-preview-003',
    module: 'Contract',
    recordId: 'CONTRACT-2026-000021',
    status: 'APPROVED',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    requestedBy: 'Jordan Smith',
    currentApproverId: 'Legal Lead',
    data: { dealValue: 132000, requestedDiscountPercent: 10 },
  },
  {
    id: 'approval-preview-004',
    module: 'Quote',
    recordId: 'QUO-2026-000151',
    status: 'REJECTED',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 35).toISOString(),
    requestedBy: 'Maria Garcia',
    currentApproverId: 'Finance Director',
    data: { dealValue: 54000, requestedDiscountPercent: 28 },
  },
];

function statusClass(status: ApprovalStatus): string {
  if (status === 'PENDING') return 'bg-amber-100 text-amber-800 ring-amber-200';
  if (status === 'ESCALATED') return 'bg-orange-100 text-orange-800 ring-orange-200';
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  if (status === 'CANCELLED') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-rose-100 text-rose-700 ring-rose-200';
}

function statusIcon(status: ApprovalStatus) {
  if (status === 'APPROVED') return CheckCircle2;
  if (status === 'REJECTED' || status === 'CANCELLED') return XCircle;
  if (status === 'ESCALATED') return AlertCircle;
  return Clock3;
}

function money(value: unknown): string {
  const amount = Number(value ?? 0);
  return `$${amount.toLocaleString()}`;
}

function discount(value: unknown): string {
  return `${Number(value ?? 0).toLocaleString()}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
  const [filter, setFilter] = useState<'ALL' | ApprovalStatus>('PENDING');
  const [query, setQuery] = useState('');
  const [drqForm, setDrqForm] = useState({
    quoteId: 'quote-nova-cpq-v1',
    requestedDiscountPercent: '12',
    reasonCode: 'STRATEGIC_ACCOUNT',
    winningProbabilityIfApproved: '72',
    reasonNotes: '',
    level1: 'Finance Manager',
    level2: 'Sales Director',
    level3: '',
  });

  const inbox = useQuery({
    queryKey: ['approval-inbox', filter],
    queryFn: () =>
      apiClients.workflow.get<ApprovalListResult>('/approval/requests', {
        params: { status: filter === 'ALL' ? undefined : filter, page: 1, limit: 50 },
      }),
    retry: 1,
  });

  const mine = useQuery({
    queryKey: ['approval-mine'],
    queryFn: () =>
      apiClients.workflow.get<ApprovalListResult>('/approval/requests/mine', {
        params: { page: 1, limit: 20 },
      }),
    retry: 1,
  });

  const quoteOptions = useQuery({
    queryKey: ['drq-quote-options'],
    queryFn: async () => {
      const res = await fetch('/api/quotes?limit=50', { cache: 'no-store' });
      const json = await res.json();
      const data = json.data?.data ?? json.data ?? [];
      return data as QuoteOption[];
    },
    retry: 1,
  });

  const discountReasons = useQuery({
    queryKey: ['drq-reasons'],
    queryFn: async () => {
      const res = await fetch('/api/finance/discount-requests/reasons', { cache: 'no-store' });
      const json = await res.json();
      return (json.data ?? []) as DiscountReason[];
    },
    retry: 1,
  });

  const approve = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      apiClients.workflow.post(`/approval/requests/${id}/approve`, { comment }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-inbox'] }),
        qc.invalidateQueries({ queryKey: ['approval-mine'] }),
      ]);
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      apiClients.workflow.post(`/approval/requests/${id}/reject`, { comment }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-inbox'] }),
        qc.invalidateQueries({ queryKey: ['approval-mine'] }),
      ]);
    },
  });

  const createDrq = useMutation({
    mutationFn: async () => {
      const hierarchy = [drqForm.level1, drqForm.level2, drqForm.level3]
        .map((approver, index) => ({ level: index + 1, approver: approver.trim() }))
        .filter((item) => item.approver);
      const res = await fetch('/api/finance/discount-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: drqForm.quoteId,
          requestedDiscountPercent: Number(drqForm.requestedDiscountPercent),
          reasonCode: drqForm.reasonCode,
          reasonNotes: drqForm.reasonNotes,
          businessImpact: drqForm.reasonNotes,
          winningProbabilityIfApproved: Number(drqForm.winningProbabilityIfApproved),
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
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-inbox'] }),
        qc.invalidateQueries({ queryKey: ['approval-mine'] }),
        qc.invalidateQueries({ queryKey: ['drq-quote-options'] }),
      ]);
      setDrqForm((s) => ({ ...s, reasonNotes: '' }));
    },
  });

  const usingPreviewData = inbox.isError && process.env.NODE_ENV === 'development';
  const rows = useMemo(
    () => inbox.data?.data ?? (usingPreviewData ? PREVIEW_APPROVALS : []),
    [inbox.data?.data, usingPreviewData]
  );
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const statusFiltered = filter === 'ALL' ? rows : rows.filter((row) => row.status === filter);
    if (!needle) return statusFiltered;
    return statusFiltered.filter((row) =>
      [row.module, row.recordId, row.requestedBy, row.currentApproverId, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [filter, query, rows]);

  const myRows = useMemo(
    () =>
      mine.data?.data ??
      (mine.isError && process.env.NODE_ENV === 'development' ? PREVIEW_APPROVALS.slice(0, 2) : []),
    [mine.data?.data, mine.isError]
  );
  const pendingMine = useMemo(
    () => myRows.filter((r) => r.status === 'PENDING' || r.status === 'ESCALATED'),
    [myRows]
  );

  const stats = useMemo(() => {
    const all = rows.length;
    const pending = rows.filter((r) => r.status === 'PENDING').length;
    const escalated = rows.filter((r) => r.status === 'ESCALATED').length;
    const approved = rows.filter((r) => r.status === 'APPROVED').length;
    return { all, pending, escalated, approved };
  }, [rows]);

  const isActing = approve.isPending || reject.isPending;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#005baf]">
                <ShieldCheck className="h-4 w-4" />
                Governance Queue
              </span>
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                SLA monitored
              </span>
            </div>
            <div className="mt-5 max-w-3xl">
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Approval command center
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                Review discount exceptions, quote approvals, workflow gates, and escalation trails from one controlled queue.
              </p>
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm font-bold transition',
                      filter === item.value
                        ? 'bg-[#137fec] text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-[#005baf]'
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
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    placeholder="Search approvals..."
                    type="search"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    void qc.invalidateQueries({ queryKey: ['approval-inbox'] });
                    void qc.invalidateQueries({ queryKey: ['approval-mine'] });
                  }}
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
                  {inbox.isLoading ? 'Loading approvals...' : `${filteredRows.length} records ready for review`}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Filter className="h-4 w-4" />
                {filter}
              </span>
            </div>

            {usingPreviewData ? (
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
                Approval service is offline, showing development preview records.
              </div>
            ) : null}

            {inbox.isError && !usingPreviewData ? (
              <StatePanel
                icon={AlertCircle}
                title="Approval service is unavailable"
                body="The queue could not be loaded. The page shell is stable, and you can retry once the approval service is back online."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Request</th>
                      <th className="px-5 py-3">Commercial impact</th>
                      <th className="px-5 py-3">Owner</th>
                      <th className="px-5 py-3">Requested</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const data = row.data ?? {};
                      const StatusIcon = statusIcon(row.status);
                      const canAct = row.status === 'PENDING' || row.status === 'ESCALATED';
                      return (
                        <tr key={row.id} className="transition hover:bg-slate-50/80">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-black text-[#005baf]">
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
                            <p className="text-xs text-slate-500">Discount request {discount(data.requestedDiscountPercent)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-medium text-slate-700">{row.requestedBy ?? 'System request'}</p>
                            <p className="text-xs text-slate-500">Approver {row.currentApproverId ?? 'Routing'}</p>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{formatDate(row.createdAt)}</td>
                          <td className="px-5 py-4">
                            <span className={cn('inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold ring-1', statusClass(row.status))}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {row.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => approve.mutate({ id: row.id, comment: 'Approved from inbox' })}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isActing || !canAct || usingPreviewData}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const note = window.prompt('Reject reason (required)');
                                  if (!note) return;
                                  reject.mutate({ id: row.id, comment: note });
                                }}
                                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isActing || !canAct || usingPreviewData}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td className="px-5 py-12" colSpan={6}>
                          <StatePanel
                            icon={inbox.isLoading ? TimerReset : FileCheck2}
                            title={inbox.isLoading ? 'Loading approval queue' : 'No approvals match this view'}
                            body={inbox.isLoading ? 'Fetching request status, approvers, and commercial impact.' : 'Try another status filter or search term.'}
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
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Create DRQ</h2>
                <p className="text-sm text-slate-500">Validated discount request with approval hierarchy.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[#005baf]" />
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Quote
                <select
                  value={drqForm.quoteId}
                  onChange={(event) => setDrqForm((s) => ({ ...s, quoteId: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {(quoteOptions.data ?? []).map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.quoteNumber ?? quote.id} · {quote.name}
                    </option>
                  ))}
                  {quoteOptions.isError ? <option value="quote-nova-cpq-v1">Q-2026-000003 · Nova Retail</option> : null}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Discount %
                  <input
                    value={drqForm.requestedDiscountPercent}
                    min="0.01"
                    max="80"
                    type="number"
                    onChange={(event) => setDrqForm((s) => ({ ...s, requestedDiscountPercent: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm normal-case"
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Win %
                  <input
                    value={drqForm.winningProbabilityIfApproved}
                    min="1"
                    max="100"
                    type="number"
                    onChange={(event) => setDrqForm((s) => ({ ...s, winningProbabilityIfApproved: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm normal-case"
                  />
                </label>
              </div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Prevalidated reason
                <select
                  value={drqForm.reasonCode}
                  onChange={(event) => setDrqForm((s) => ({ ...s, reasonCode: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case text-slate-700"
                >
                  {(discountReasons.data ?? []).map((reason) => (
                    <option key={reason.code} value={reason.code}>{reason.label}</option>
                  ))}
                </select>
              </label>
              <textarea
                value={drqForm.reasonNotes}
                onChange={(event) => setDrqForm((s) => ({ ...s, reasonNotes: event.target.value }))}
                rows={3}
                placeholder="Business reason, customer context, competitive pressure..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <div className="grid gap-2">
                {[1, 2, 3].map((level) => (
                  <input
                    key={level}
                    value={drqForm[`level${level}` as 'level1']}
                    onChange={(event) => setDrqForm((s) => ({ ...s, [`level${level}`]: event.target.value }))}
                    placeholder={`Approval level ${level}${level === 3 ? ' (optional)' : ''}`}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
                  />
                ))}
              </div>
              {createDrq.isError ? (
                <p className="rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{createDrq.error.message}</p>
              ) : null}
              {createDrq.isSuccess ? (
                <p className="rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">DRQ created and routed to approval workflow.</p>
              ) : null}
              <button
                type="button"
                onClick={() => createDrq.mutate()}
                disabled={createDrq.isPending}
                className="w-full rounded-lg bg-[#137fec] px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {createDrq.isPending ? 'Validating...' : 'Create DRQ workflow'}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">My pending approvals</h2>
                <p className="text-sm text-slate-500">Submitted records waiting on review.</p>
              </div>
              <GitBranch className="h-5 w-5 text-[#005baf]" />
            </div>
            <div className="mt-5 space-y-3">
              {mine.isError && !usingPreviewData ? (
                <StatePanel
                  icon={AlertCircle}
                  title="Could not load your queue"
                  body="Retry when the workflow service is reachable."
                  compact
                />
              ) : null}
              {pendingMine.map((row) => (
                <div key={`mine-${row.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{row.module}</p>
                      <p className="mt-1 text-xs text-slate-500">Reviewer {row.currentApproverId ?? 'routing'} · {new Date(row.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={cn('rounded px-2 py-1 text-[10px] font-bold ring-1', statusClass(row.status))}>
                      {row.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                    onClick={() => qc.invalidateQueries({ queryKey: ['approval-mine'] })}
                  >
                    Send reminder
                  </button>
                </div>
              ))}
              {!mine.isError && pendingMine.length === 0 ? (
                <StatePanel
                  icon={CheckCircle2}
                  title={mine.isLoading ? 'Loading your approvals' : 'Nothing waiting on you'}
                  body={mine.isLoading ? 'Checking submitted approval requests.' : 'Your submitted approval queue is clear.'}
                  compact
                />
              ) : null}
            </div>
          </section>

          <section className="rounded-xl bg-slate-950 p-5 text-white shadow-sm">
            <h2 className="text-lg font-bold">Approval controls</h2>
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <ControlLine label="Routing engine" value="Policy + hierarchy" />
              <ControlLine label="Audit trail" value="Immutable events" />
              <ControlLine label="SLA handling" value="Escalation ready" />
              <ControlLine label="Decision lock" value="Single approver action" />
            </div>
          </section>
        </aside>
      </section>
    </div>
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
    blue: 'bg-blue-50 text-[#005baf]',
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
